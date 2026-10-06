import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    const { password, employeeNo, hireDate, ...rest } = data;
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

  async assignRole(
    accountId: string,
    roleId: string,
    scopeType: 'TENANT' | 'REGION' | 'STORE' | 'DEPARTMENT' | 'TEAM' | 'SELF',
    scopeId?: string,
  ) {
    await this.findOneOrThrow(accountId);
    const assignment = await this.prisma.accountRoleAssignment.create({
      data: {
        tenantId: this.ctx.tenantId!,
        accountId,
        roleId,
        scopeType,
        scopeId: scopeId ?? null,
        grantedBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'AccountRoleAssignment',
      entityId: assignment.id,
      afterData: assignment,
      ...this.auditCtx(),
    });
    return assignment;
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

  async revokeRoleAssignment(assignmentId: string) {
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
