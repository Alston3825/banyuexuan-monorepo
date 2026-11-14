import { IntegrationEventsService } from '../../integration/integration-events.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { checkIdCard } from '../../common/utils/id-card.util';
import { assertEmployeeNoForStore, nextEmployeeNo } from '../../common/utils/employee-no.util';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { QueryEmployeeProfileDto } from './dto/query-employee-profile.dto';

const includeProfile = {
  account: {
    select: {
      id: true,
      realName: true,
      username: true,
      phone: true,
      storeId: true,
      departmentId: true,
      positionId: true,
      store: { select: { name: true } },
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  },
} satisfies Prisma.EmployeeProfileInclude;

type ProfileWithAccount = Prisma.EmployeeProfileGetPayload<{ include: typeof includeProfile }>;

/** 满几年算几年（员工信息表“工龄（年）”）；离职的算到离职日。 */
function tenureYears(hireDate: Date, end: Date = new Date()): number {
  let years = end.getFullYear() - hireDate.getFullYear();
  const beforeAnniversary = end.getMonth() < hireDate.getMonth() || (end.getMonth() === hireDate.getMonth() && end.getDate() < hireDate.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

const DATE_FIELDS = ['hireDate', 'healthCertExpiresAt', 'contractExpiresAt', 'probationEndsAt', 'terminationDate'] as const;
const TEXT_FIELDS = ['terminationReason', 'bankName', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation', 'address', 'remark'] as const;

/** 员工档案：Account 的 1:1 HR 扩展，身份信息（姓名/门店/部门/职位/手机）仍以 Account 为准。 */
@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly integrationEvents: IntegrationEventsService,
  ) {}

  /** 列表/详情附带：部门名、职务名、手机（来自账号）、工龄。 */
  private decorate(p: ProfileWithAccount) {
    return {
      ...p,
      phone: p.account.phone,
      storeName: p.account.store?.name ?? null,
      departmentName: p.account.department?.name ?? null,
      positionName: p.account.position?.name ?? null,
      tenureYears: tenureYears(p.hireDate, p.status === 'TERMINATED' && p.terminationDate ? p.terminationDate : new Date()),
    };
  }

  async findMany(query: QueryEmployeeProfileDto = {}) {
    const keyword = query.keyword?.trim();
    const rows = await this.prisma.employeeProfile.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        status: query.status,
        archivedAt: query.archived === 'only' ? { not: null } : query.archived === 'all' ? undefined : null,
        account: {
          storeId: query.storeId || undefined,
          departmentId: query.departmentId || undefined,
        },
        ...(keyword ? { OR: [{ employeeNo: { contains: keyword } }, { account: { realName: { contains: keyword } } }] } : {}),
      },
      include: includeProfile,
      orderBy: [{ employeeNo: 'asc' }],
    });
    return rows.map((p) => this.decorate(p));
  }

  async findOneOrThrow(id: string) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { id }, include: includeProfile });
    if (!profile) throw new NotFoundException(`EmployeeProfile ${id} 不存在`);
    return this.decorate(profile);
  }

  /** 到期提醒：健康证/合同/转正三类日期字段，withinDays 内到期或已过期均返回。 */
  async expiryAlerts(withinDays = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);
    const now = new Date();

    const profiles = await this.prisma.employeeProfile.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        status: 'ACTIVE',
        OR: [
          { healthCertExpiresAt: { lte: threshold } },
          { contractExpiresAt: { lte: threshold } },
          { probationEndsAt: { lte: threshold } },
        ],
      },
      include: includeProfile,
    });

    return profiles.map((p) => ({
      ...this.decorate(p),
      alerts: [
        p.healthCertExpiresAt && p.healthCertExpiresAt <= threshold
          ? { type: 'HEALTH_CERT', expiresAt: p.healthCertExpiresAt, isExpired: p.healthCertExpiresAt < now }
          : null,
        p.contractExpiresAt && p.contractExpiresAt <= threshold
          ? { type: 'CONTRACT', expiresAt: p.contractExpiresAt, isExpired: p.contractExpiresAt < now }
          : null,
        p.probationEndsAt && p.probationEndsAt <= threshold
          ? { type: 'PROBATION', expiresAt: p.probationEndsAt, isExpired: p.probationEndsAt < now }
          : null,
      ].filter((a): a is { type: string; expiresAt: Date; isExpired: boolean } => a !== null),
    }));
  }

  /**
   * 身份证号：校验后规范化；同时自动算出性别和出生日期。空字符串 = 清空（性别/出生日期一起清掉）。
   * 同一租户内身份证号不能重复（防止同一个人建两份档案）。
   */
  private async idCardFields(raw: string | undefined, selfId?: string): Promise<Partial<Prisma.EmployeeProfileUncheckedUpdateInput>> {
    if (raw === undefined) return {};
    const text = raw.trim();
    if (!text) return { idCardNo: null, gender: null, birthDate: null };
    const check = checkIdCard(text);
    if (!check.valid) throw new BadRequestException(check.reason ?? '身份证号不正确');
    const dup = await this.prisma.employeeProfile.findFirst({ where: { tenantId: this.ctx.tenantId, idCardNo: check.normalized, ...(selfId ? { NOT: { id: selfId } } : {}) }, include: { account: { select: { realName: true } } } });
    if (dup) throw new ConflictException(`这个身份证号已经是员工“${dup.account.realName}”的档案了`);
    return { idCardNo: check.normalized, gender: check.gender, birthDate: new Date(`${check.birthday}T00:00:00.000Z`) };
  }

  private bankAccountField(raw: string | undefined): Partial<Prisma.EmployeeProfileUncheckedUpdateInput> {
    if (raw === undefined) return {};
    const text = raw.replace(/\s/g, '');
    if (!text) return { bankAccountNo: null };
    if (!/^\d{6,32}$/.test(text)) throw new BadRequestException('工资卡账号应为 6~32 位数字');
    return { bankAccountNo: text };
  }

  private async assertEmployeeNoFree(employeeNo: string, selfId?: string) {
    const dup = await this.prisma.employeeProfile.findFirst({
      where: { tenantId: this.ctx.tenantId, activeEmployeeNo: employeeNo, ...(selfId ? { NOT: { id: selfId } } : {}) },
      include: { account: { select: { realName: true } } },
    });
    if (dup) throw new ConflictException(`工号 ${employeeNo} 已经分配给「${dup.account.realName}」，请换一个（离职归档的员工工号才可以回收）`);
  }

  private dates(dto: Record<string, unknown>): Record<string, Date | null | undefined> {
    const out: Record<string, Date | null | undefined> = {};
    for (const f of DATE_FIELDS) {
      const v = dto[f];
      if (typeof v === 'string' && v) out[f] = new Date(v);
    }
    return out;
  }

  private texts(dto: Record<string, unknown>): Record<string, string | null | undefined> {
    const out: Record<string, string | null | undefined> = {};
    for (const f of TEXT_FIELDS) {
      const v = dto[f];
      if (typeof v === 'string') out[f] = v.trim() || null;
    }
    return out;
  }

  async create(dto: CreateEmployeeProfileDto): Promise<EmployeeProfile> {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) throw new NotFoundException(`Account ${dto.accountId} 不存在`);
    const existing = await this.prisma.employeeProfile.findUnique({ where: { accountId: dto.accountId } });
    if (existing) throw new BadRequestException('该账号已建立员工档案');
    await this.assertEmployeeNoFree(dto.employeeNo);
    await assertEmployeeNoForStore(this.prisma, account.storeId, dto.employeeNo);
    const idCard = await this.idCardFields(dto.idCardNo);

    const created = await this.prisma.employeeProfile.create({
      data: {
        tenantId: this.ctx.tenantId!,
        accountId: dto.accountId,
        employeeNo: dto.employeeNo,
        activeEmployeeNo: dto.employeeNo,
        employmentType: dto.employmentType,
        contractType: dto.contractType,
        socialInsurance: dto.socialInsurance,
        ...this.dates(dto as unknown as Record<string, unknown>),
        hireDate: new Date(dto.hireDate),
        ...this.texts(dto as unknown as Record<string, unknown>),
        ...(idCard as object),
        ...(this.bankAccountField(dto.bankAccountNo) as object),
        createdBy: this.ctx.accountId!,
      },
      include: includeProfile,
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'EmployeeProfile',
      entityId: created.id,
      afterData: created,
      tenantId: this.ctx.tenantId,
      storeId: account.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.decorate(created) as unknown as EmployeeProfile;
  }

  async update(id: string, dto: UpdateEmployeeProfileDto): Promise<EmployeeProfile> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    const { version: _version, ...rest } = dto;
    if (before.archivedAt) throw new BadRequestException('这位员工已离职归档，档案只读。需要修改请管理员先“恢复在职”');
    if (rest.employeeNo !== undefined) {
      if (!rest.employeeNo.trim()) throw new BadRequestException('工号不能为空');
      if (rest.employeeNo !== before.employeeNo) {
        // 工号是员工的主要识别方式，一旦分配不能随便改：只有拥有“修改员工工号”权限的人（默认仅管理员）才可以
        if (!(await this.ctx.hasPermission('hr.employee-profile.change-no'))) throw new ForbiddenException('工号一旦分配，只有管理员才能修改');
        await this.assertEmployeeNoFree(rest.employeeNo, id);
        const acc = await this.prisma.account.findUnique({ where: { id: before.accountId }, select: { storeId: true } });
        await assertEmployeeNoForStore(this.prisma, acc?.storeId, rest.employeeNo);
      }
    }
    const idCard = await this.idCardFields(rest.idCardNo, id);
    // 呼叫定位系统：手表设备号同租户唯一
    let watchPatch: { watchId?: string | null } = {};
    if (rest.watchId !== undefined) {
      const w = rest.watchId.trim();
      if (w) {
        const dup = await this.prisma.employeeProfile.findFirst({ where: { tenantId: this.ctx.tenantId, watchId: w, id: { not: id } }, include: { account: { select: { realName: true } } } });
        if (dup) throw new ConflictException(`手表 ${w} 已绑定给 ${dup.account.realName}，请先解绑`);
      }
      watchPatch = { watchId: w || null };
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.employeeProfile.update({
        where: { id, version: dto.version },
        data: {
          employeeNo: rest.employeeNo,
          ...(rest.employeeNo !== undefined ? { activeEmployeeNo: rest.employeeNo } : {}),
          employmentType: rest.employmentType,
          contractType: rest.contractType,
          socialInsurance: rest.socialInsurance,
          status: rest.status,
          ...this.dates(rest as unknown as Record<string, unknown>),
          ...this.texts(rest as unknown as Record<string, unknown>),
          ...idCard,
          ...this.bankAccountField(rest.bankAccountNo),
          ...watchPatch,
          ...(rest.dutyStatus !== undefined ? { dutyStatus: rest.dutyStatus } : {}),
          ...(rest.responsibleFloors !== undefined ? { responsibleFloors: rest.responsibleFloors } : {}),
          version: { increment: 1 },
        },
        include: includeProfile,
      }),
    );
    if (before.account.storeId && (rest.dutyStatus !== undefined || rest.watchId !== undefined || rest.responsibleFloors !== undefined)) {
      await this.integrationEvents.emit(this.ctx.tenantId!, before.account.storeId, 'staff.duty_changed', before.accountId, {
        staff_id: before.accountId,
        store_id: before.account.storeId,
        duty_status: updated.dutyStatus,
        watch_id: updated.watchId,
        responsible_floors: updated.responsibleFloors ?? [],
      });
    }
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'EmployeeProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(rest),
      tenantId: this.ctx.tenantId,
      storeId: before.account.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.decorate(updated) as unknown as EmployeeProfile;
  }

  /** 下一个可用工号（新建账号/员工档案时预填） */
  nextNo(storeId?: string) {
    return nextEmployeeNo(this.prisma, this.ctx.tenantId!, [], storeId).then((employeeNo) => ({ employeeNo }));
  }

  /**
   * 离职归档：档案标为已离职并只读、账号停用（并让已登录的会话失效）、工号释放（可回收给新员工）。
   * 历史记录里仍然显示原来的工号和姓名，不受影响。
   */
  async archive(id: string, input: { terminationDate?: string; reason?: string; version: number }) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== input.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.archivedAt) throw new BadRequestException('这位员工已经归档过了');
    const termination = input.terminationDate ? new Date(input.terminationDate) : (before.terminationDate ?? new Date());
    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.employeeProfile.update({
        where: { id },
        data: {
          status: 'TERMINATED',
          terminationDate: termination,
          terminationReason: input.reason?.trim() || before.terminationReason || undefined,
          archivedAt: new Date(),
          activeEmployeeNo: null,
          version: { increment: 1 },
        },
        include: includeProfile,
      });
      await tx.account.update({ where: { id: before.accountId }, data: { status: 'DISABLED', version: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { accountId: before.accountId, revokedAt: null }, data: { revokedAt: new Date() } });
      return p;
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'EmployeeProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `离职归档：${before.account.realName}，工号 ${before.employeeNo} 已释放`,
      tenantId: this.ctx.tenantId,
      storeId: before.account.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.decorate(updated);
  }

  /** 恢复在职（返聘/误归档）：工号默认沿用原来的，已被别人用了就必须换一个新工号；账号恢复启用。 */
  async restore(id: string, input: { employeeNo?: string; version: number }) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== input.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (!before.archivedAt) throw new BadRequestException('这位员工没有归档');
    const employeeNo = input.employeeNo?.trim() || before.employeeNo;
    await this.assertEmployeeNoFree(employeeNo, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.employeeProfile.update({
        where: { id },
        data: { employeeNo, activeEmployeeNo: employeeNo, archivedAt: null, status: 'ACTIVE', terminationDate: null, terminationReason: null, version: { increment: 1 } },
        include: includeProfile,
      });
      await tx.account.update({ where: { id: before.accountId }, data: { status: 'ACTIVE', version: { increment: 1 } } });
      return p;
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'EmployeeProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `恢复在职：${before.account.realName}，工号 ${employeeNo}`,
      tenantId: this.ctx.tenantId,
      storeId: before.account.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.decorate(updated);
  }
}
