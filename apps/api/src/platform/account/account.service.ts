import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
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
  }) {
    await this.dataScopeService.assertStoreAccessible(this.ctx, data.storeId);
    const { password, ...rest } = data;
    const passwordHash = await this.passwordService.hash(password);
    const created = await this.prisma.account.create({
      data: { ...rest, passwordHash, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
      omit: ACCOUNT_OMIT,
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
    data: { realName?: string; phone?: string; email?: string; status?: 'ACTIVE' | 'DISABLED' | 'LOCKED' },
    expectedVersion: number,
  ) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await this.prisma.account.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      omit: ACCOUNT_OMIT,
    });
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
