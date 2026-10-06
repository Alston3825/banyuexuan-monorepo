import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(): Promise<Role[]> {
    return this.prisma.role.findMany({ include: { permissions: { include: { permissionPoint: true } } } });
  }

  async findOneOrThrow(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permissionPoint: true } } },
    });
    if (!role) throw new NotFoundException(`Role ${id} 不存在`);
    return role;
  }

  async create(data: { code?: string; name: string; description?: string }): Promise<Role> {
    const created = await this.prisma.role.create({
      data: {
        ...data,
        code: data.code ?? generateBusinessNo('RL'),
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Role',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: { name?: string; description?: string; status?: 'ACTIVE' | 'INACTIVE' },
    expectedVersion: number,
  ): Promise<Role> {
    const before = await this.assertMutable(id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.role.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Role',
      entityId: id,
      beforeData: before,
      afterData: updated,
      ...this.auditCtx(),
    });
    return updated;
  }

  /**
   * 角色一旦设置过权限（RoleOnPermission）或被分配给过账号（AccountRoleAssignment），
   * 直接 delete() 会撞外键约束——之前没处理，Prisma抛出的P2003原样冒泡成一个没有实际
   * 信息的500"服务器错误"。这里区分两种情况：还有账号在用这个角色，属于真实的数据完整性
   * 风险，拒绝删除并给出清楚的原因（不能静默把账号的角色关联删掉，那样对应账号会在不知情
   * 的情况下丢失权限）；只是角色自己配过权限点、没有账号在用，这种是安全的，先清掉
   * RoleOnPermission 再删角色本身，两步放在一个事务里。
   */
  async delete(id: string): Promise<void> {
    const before = await this.assertMutable(id);
    const activeAssignmentCount = await this.prisma.accountRoleAssignment.count({
      where: { roleId: id, revokedAt: null },
    });
    if (activeAssignmentCount > 0) {
      throw new ConflictException(`该角色仍有 ${activeAssignmentCount} 个账号在使用，请先解除这些账号的角色关联后再删除`);
    }
    await this.prisma.$transaction([
      this.prisma.roleOnPermission.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'Role',
      entityId: id,
      beforeData: before,
      ...this.auditCtx(),
    });
  }

  /**
   * 用 upsert 不用 create：这个权限点已经被授予过时应该是无操作，不是报错——
   * 权限树是cascade勾选，勾一个大模块要并发打十几个请求，前端乐观更新+快速连续操作
   * (勾了又取消又勾回来、或者不小心双击)都可能让同一个permissionPointId被重复提交，
   * 之前用create()撞到 @@unique([roleId, permissionPointId]) 会抛P2002，没有被专门
   * 捕获，最终表现成一个没有实际信息的500"服务器错误"，把"其实已经生效了"的操作误报成失败。
   */
  async grantPermission(roleId: string, permissionPointId: string) {
    await this.assertMutable(roleId);
    const grant = await this.prisma.roleOnPermission.upsert({
      where: { roleId_permissionPointId: { roleId, permissionPointId } },
      update: {},
      create: { roleId, permissionPointId, createdBy: this.ctx.accountId! },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'RoleOnPermission',
      entityId: grant.id,
      afterData: grant,
      ...this.auditCtx(),
    });
    return grant;
  }

  async revokePermission(roleId: string, permissionPointId: string) {
    await this.assertMutable(roleId);
    await this.prisma.roleOnPermission.deleteMany({ where: { roleId, permissionPointId } });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'RoleOnPermission',
      remark: `roleId=${roleId} permissionPointId=${permissionPointId}`,
      ...this.auditCtx(),
    });
  }

  /** 内置系统角色（如 SUPER_ADMIN）不可改名/删除/调整权限，保护平台最小可用性。 */
  private async assertMutable(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} 不存在`);
    if (role.isSystem) throw new ForbiddenException('系统内置角色不可修改');
    return role;
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
