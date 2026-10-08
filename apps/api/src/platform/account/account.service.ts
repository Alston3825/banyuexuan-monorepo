import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { PasswordService } from '../../auth/password.service';

/** 所有对外返回的账号查询一律省略 passwordHash，即使是哈希值也不应该出现在 API 响应里。 */
const ACCOUNT_OMIT = { passwordHash: true } as const;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    private readonly auditLogService: AuditLogService,
    private readonly passwordService: PasswordService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany() {
    const allowed = await this.dataScopeService.resolveAllowedStoreIds(this.ctx);
    return this.prisma.account.findMany({
      where: allowed === 'ALL' ? {} : { storeId: { in: allowed } },
      omit: ACCOUNT_OMIT,
    });
  }

  async findOneOrThrow(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      omit: ACCOUNT_OMIT,
      include: { roleAssignments: { where: { revokedAt: null }, include: { role: true } } },
    });
    if (!account) throw new NotFoundException(`Account ${id} 不存在`);
    return account;
  }

  /** 手机号、工号是员工的主要识别方式，都不能重复：提前查出来给一句人话，不让用户看到数据库报错。 */
  private async assertPhoneFree(phone: string | null | undefined, exceptAccountId?: string) {
    if (!phone) return;
    const dup = await this.prisma.account.findFirst({ where: { tenantId: this.ctx.tenantId, phone, ...(exceptAccountId ? { NOT: { id: exceptAccountId } } : {}) }, select: { realName: true, status: true } });
    if (dup) throw new ConflictException(`手机号 ${phone} 已经是「${dup.realName}」的账号了${dup.status !== 'ACTIVE' ? '（已停用）' : ''}，同一个手机号只能开一个账号`);
  }

  private async assertEmployeeNoFree(employeeNo: string) {
    const dup = await this.prisma.employeeProfile.findFirst({ where: { tenantId: this.ctx.tenantId, activeEmployeeNo: employeeNo }, include: { account: { select: { realName: true } } } });
    if (dup) throw new ConflictException(`工号 ${employeeNo} 已经分配给「${dup.account.realName}」，请换一个（离职归档的员工工号才可以回收）`);
  }

  async create(data: {
    username: string;
    realName: string;
    password: string;
    phone?: string;
    email?: string;
    storeId?: string;
    departmentId?: string;
    teamId?: string;
    positionId?: string;
    status?: 'ACTIVE' | 'DISABLED';
    employeeNo?: string;
    hireDate?: string;
  }) {
    await this.dataScopeService.assertStoreAccessible(this.ctx, data.storeId);
    const { password, employeeNo, hireDate, ...restRaw } = data;
    const rest = { ...restRaw, phone: restRaw.phone?.trim() || undefined, email: restRaw.email?.trim() || undefined };
    await this.assertPhoneFree(rest.phone);
    if (employeeNo && hireDate) await this.assertEmployeeNoFree(employeeNo);
    const passwordHash = await this.passwordService.hash(password);
    // 账号与员工档案一一对应（EmployeeProfile.accountId是唯一外键）：员工的工号/入职日期
    // 一起传了，就在同一个事务里把账号和员工档案一起建好，不需要再单独跑一遍"员工档案"
    // 模块补录——这正是"两个录入口子容易漏录/对不上"这个问题的根本解法，见业务规则确认
    // 记录"账号与员工档案关联"一节。两个字段只要有一个没填就跳过建档（比如第三方对接账号
        // 本来就不对应真实员工），不强制。
    const created = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: { ...rest, passwordHash, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
        omit: ACCOUNT_OMIT,
      });
      if (employeeNo && hireDate) {
        await tx.employeeProfile.create({
          data: {
            tenantId: this.ctx.tenantId!,
            accountId: account.id,
            employeeNo,
            activeEmployeeNo: employeeNo, // 占用工号（离职归档时释放）
            hireDate: new Date(hireDate),
            createdBy: this.ctx.accountId!,
          },
        });
      }
      return account;
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Account',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: {
      realName?: string;
      phone?: string;
      email?: string;
      storeId?: string | null;
      departmentId?: string | null;
      teamId?: string | null;
      positionId?: string | null;
      status?: 'ACTIVE' | 'DISABLED' | 'LOCKED';
    },
    expectedVersion: number,
  ) {
    const before = await this.findOneOrThrow(id);
    if (data.phone !== undefined) {
      data = { ...data, phone: data.phone?.trim() || (null as unknown as undefined) }; // 空 = 清空（存成 null，不占手机号唯一）
      if (data.phone && data.phone !== before.phone) await this.assertPhoneFree(data.phone, id);
    }
    if (data.storeId && data.storeId !== before.storeId) await this.dataScopeService.assertStoreAccessible(this.ctx, data.storeId);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.account.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
        omit: ACCOUNT_OMIT,
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Account',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 管理员重置密码：不校验旧密码（自助改密留待 P1+ 实现）。 */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.findOneOrThrow(id);
    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.account.update({ where: { id }, data: { passwordHash, version: { increment: 1 } } });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Account',
      entityId: id,
      changedFields: ['passwordHash'],
      remark: '管理员重置密码',
      ...this.auditCtx(),
    });
  }

  /**
   * 给员工分配角色。范围对象可以一次选多个（比如同时管 3 家门店）：每个对象生成一条分配记录，
   * 已经分配过的自动跳过。校验：角色存在、范围对象存在且必填、不能分配比自己权限大的角色/管不到的范围、不重复。
   */
  async assignRole(
    accountId: string,
    roleId: string,
    scopeType: 'TENANT' | 'REGION' | 'STORE' | 'DEPARTMENT' | 'TEAM' | 'SELF',
    scopeIds: string[] = [],
  ) {
    await this.findOneOrThrow(accountId);
    const tenantId = this.ctx.tenantId!;

    // 1) 角色必须存在
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId }, include: { permissions: { select: { permissionPoint: { select: { code: true } } } } } });
    if (!role) throw new BadRequestException('所选角色不存在（可能已被删除），请刷新页面后重选');

    // 2) 范围：门店级/区域级/部门级/班组级必须选具体对象（可多选），租户级/仅本人不需要对象
    const needsId = ['REGION', 'STORE', 'DEPARTMENT', 'TEAM'].includes(scopeType);
    const ids = needsId ? [...new Set(scopeIds.filter(Boolean))] : [];
    if (needsId && ids.length === 0) throw new BadRequestException('请选择范围对象（比如“门店级”要选具体是哪家门店，可以多选），不选的话这个角色不会生效');
    const targets: (string | null)[] = needsId ? ids : [null];

    // 每个范围对象必须存在，并记下它属于哪家门店（用来做越权检查）
    const storeOf = new Map<string, string | null>();
    for (const id of ids) {
      if (scopeType === 'STORE') {
        if (!(await this.prisma.store.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw new BadRequestException('所选门店不存在');
        storeOf.set(id, id);
      } else if (scopeType === 'REGION') {
        if (!(await this.prisma.region.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw new BadRequestException('所选区域不存在');
        storeOf.set(id, null);
      } else if (scopeType === 'DEPARTMENT') {
        const d = await this.prisma.department.findFirst({ where: { id, tenantId }, select: { storeId: true } });
        if (!d) throw new BadRequestException('所选部门不存在');
        storeOf.set(id, d.storeId);
      } else if (scopeType === 'TEAM') {
        const t = await this.prisma.team.findFirst({ where: { id, tenantId }, select: { storeId: true } });
        if (!t) throw new BadRequestException('所选班组不存在');
        storeOf.set(id, t.storeId);
      }
    }

    // 3) 防越权：不能把比自己权限大的角色分给别人（否则有“账号管理”权限的店长能给自己分配超级管理员），
    //    也不能把范围放大到自己管不到的门店/全公司
    const myCodes = await this.ctx.getPermissionCodes();
    const missing = role.permissions.map((p) => p.permissionPoint.code).filter((c) => !myCodes.has(c));
    if (missing.length > 0) throw new ForbiddenException(`不能分配权限比自己大的角色「${role.name}」（它包含你自己都没有的 ${missing.length} 项权限）。请联系管理员处理`);
    const allowedStores = await this.dataScopeService.resolveAllowedStoreIds(this.ctx);
    if (allowedStores !== 'ALL') {
      if (scopeType === 'TENANT') throw new ForbiddenException('只有管理员才能分配“全公司”范围');
      if (scopeType === 'REGION') throw new ForbiddenException('只有管理员才能分配“区域级”范围');
      for (const id of ids) {
        const sid = storeOf.get(id);
        if (sid && !allowedStores.includes(sid)) throw new ForbiddenException('不能分配到你自己管不到的门店');
      }
    }

    // 4) 逐个生成分配记录；同一员工、同一角色、同一范围已经有的跳过
    const created: Awaited<ReturnType<typeof this.prisma.accountRoleAssignment.create>>[] = [];
    let skipped = 0;
    for (const target of targets) {
      const dup = await this.prisma.accountRoleAssignment.findFirst({ where: { accountId, roleId, scopeType, scopeId: target, revokedAt: null } });
      if (dup) {
        skipped++;
        continue;
      }
      const assignment = await this.prisma.accountRoleAssignment.create({
        data: { tenantId, accountId, roleId, scopeType, scopeId: target, grantedBy: this.ctx.accountId! },
      });
      await this.auditLogService.record({
        action: 'CREATE',
        entityType: 'AccountRoleAssignment',
        entityId: assignment.id,
        afterData: assignment,
        ...this.auditCtx(),
      });
      created.push(assignment);
    }
    if (created.length === 0) throw new ConflictException(`这位员工已经有「${role.name}」这个角色（所选范围都已分配过），不需要重复分配`);
    return { ...created[0], createdCount: created.length, skippedCount: skipped };
  }

  /**
   * 删除账号：不能删自己当前登录用的账号；账号名下只要还挂着真实业务数据
   * （被指派的客户/线索/机会、报销/签呈/用车申请、考试记录、离店关怀任务，以及
   * 员工档案下真正产生过的排班/提成/薪资/请假记录）就一律拒绝物理删除并提示改用
   * "禁用"——这些是要保留审计追溯的业务记录，不能因为删了操作人账号就跟着级联消失。
   * 但新建账号时会顺带自动建一份空的员工档案（见 create()），这份"只有工号+入职日期、
   * 从没实际用过"的空档案本身不构成删除障碍——不然靠这个UI新建的账号会永远删不掉，
   * 用户明确反馈过这一点，所以只在员工档案下面真的有排班/提成/薪资/请假记录时才拦，
   * 空档案跟着账号一起删。角色分配/登录令牌同理，没有独立业务含义，直接连带清掉。
   * 跟 role.service.ts 的 delete() 是同一套"先查有没有依赖、有依赖就拒绝"思路。
   */
  async remove(id: string): Promise<void> {
    if (id === this.ctx.accountId) {
      throw new ConflictException('不能删除当前登录使用的账号');
    }
    const before = await this.findOneOrThrow(id);

    const [
      employeeProfile,
      customerCount,
      leadCount,
      opportunityCount,
      expenseClaimCount,
      generalMemoCount,
      vehicleBookingCount,
      examAttemptCount,
      outreachTaskCount,
    ] = await Promise.all([
      this.prisma.employeeProfile.findUnique({
        where: { accountId: id },
        include: { _count: { select: { scheduleEntries: true, commissionAllocations: true, payrollRecords: true, leaveRequests: true } } },
      }),
      this.prisma.customer.count({ where: { assignedToId: id } }),
      this.prisma.lead.count({ where: { assignedToId: id } }),
      this.prisma.salesOpportunity.count({ where: { assignedToId: id } }),
      this.prisma.expenseClaim.count({ where: { applicantId: id } }),
      this.prisma.generalMemo.count({ where: { applicantId: id } }),
      this.prisma.vehicleBooking.count({ where: { applicantId: id } }),
      this.prisma.examAttempt.count({ where: { OR: [{ accountId: id }, { gradedById: id }] } }),
      this.prisma.careOutreachTask.count({ where: { completedById: id } }),
    ]);
    const blockers: string[] = [];
    if (employeeProfile) {
      const c = employeeProfile._count;
      if (c.scheduleEntries) blockers.push(`${c.scheduleEntries} 条排班记录`);
      if (c.commissionAllocations) blockers.push(`${c.commissionAllocations} 条提成记录`);
      if (c.payrollRecords) blockers.push(`${c.payrollRecords} 条薪资记录`);
      if (c.leaveRequests) blockers.push(`${c.leaveRequests} 条请假记录`);
    }
    if (customerCount) blockers.push(`${customerCount} 个客户`);
    if (leadCount) blockers.push(`${leadCount} 条线索`);
    if (opportunityCount) blockers.push(`${opportunityCount} 个销售机会`);
    if (expenseClaimCount) blockers.push(`${expenseClaimCount} 条报销申请`);
    if (generalMemoCount) blockers.push(`${generalMemoCount} 条日常签呈`);
    if (vehicleBookingCount) blockers.push(`${vehicleBookingCount} 条用车申请`);
    if (examAttemptCount) blockers.push(`${examAttemptCount} 条考试记录`);
    if (outreachTaskCount) blockers.push(`${outreachTaskCount} 条离店关怀任务`);
    if (blockers.length > 0) {
      throw new ConflictException(`该账号名下还有${blockers.join('、')}，无法删除，请改用"禁用"停止其登录`);
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { accountId: id } }),
      this.prisma.accountRoleAssignment.deleteMany({ where: { accountId: id } }),
      this.prisma.employeeProfile.deleteMany({ where: { accountId: id } }),
      this.prisma.account.delete({ where: { id } }),
    ]);
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'Account',
      entityId: id,
      beforeData: before,
      ...this.auditCtx(),
    });
  }

  async revokeRoleAssignment(accountId: string, assignmentId: string) {
    // 必须是这位员工名下的分配记录（以前只按分配编号撤销，路径里的员工编号被忽略）
    const found = await this.prisma.accountRoleAssignment.findFirst({ where: { id: assignmentId, accountId, tenantId: this.ctx.tenantId } });
    if (!found) throw new NotFoundException('找不到这条角色分配');
    const assignment = await this.prisma.accountRoleAssignment.update({
      where: { id: assignmentId },
      data: { revokedAt: new Date() },
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'AccountRoleAssignment',
      entityId: assignmentId,
      afterData: assignment,
      remark: '撤销角色授权',
      ...this.auditCtx(),
    });
    return assignment;
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
