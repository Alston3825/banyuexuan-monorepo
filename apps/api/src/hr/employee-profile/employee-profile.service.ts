import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { checkIdCard } from '../../common/utils/id-card.util';
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
    const dup = await this.prisma.employeeProfile.findFirst({ where: { tenantId: this.ctx.tenantId, employeeNo, ...(selfId ? { NOT: { id: selfId } } : {}) } });
    if (dup) throw new ConflictException(`工号 ${employeeNo} 已被使用`);
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
    const idCard = await this.idCardFields(dto.idCardNo);

    const created = await this.prisma.employeeProfile.create({
      data: {
        tenantId: this.ctx.tenantId!,
        accountId: dto.accountId,
        employeeNo: dto.employeeNo,
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
    if (rest.employeeNo !== undefined) {
      if (!rest.employeeNo.trim()) throw new BadRequestException('工号不能为空');
      if (rest.employeeNo !== before.employeeNo) await this.assertEmployeeNoFree(rest.employeeNo, id);
    }
    const idCard = await this.idCardFields(rest.idCardNo, id);
    const updated = await runVersionedUpdate(() =>
      this.prisma.employeeProfile.update({
        where: { id, version: dto.version },
        data: {
          employeeNo: rest.employeeNo,
          employmentType: rest.employmentType,
          contractType: rest.contractType,
          socialInsurance: rest.socialInsurance,
          status: rest.status,
          ...this.dates(rest as unknown as Record<string, unknown>),
          ...this.texts(rest as unknown as Record<string, unknown>),
          ...idCard,
          ...this.bankAccountField(rest.bankAccountNo),
          version: { increment: 1 },
        },
        include: includeProfile,
      }),
    );
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
}
