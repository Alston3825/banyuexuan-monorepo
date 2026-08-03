import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';

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
    const updated = await this.prisma.role.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
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

  async delete(id: string): Promise<void> {
    const before = await this.assertMutable(id);
    await this.prisma.role.delete({ where: { id } });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'Role',
      entityId: id,
      beforeData: before,
      ...this.auditCtx(),
    });
  }

  async grantPermission(roleId: string, permissionPointId: string) {
    await this.assertMutable(roleId);
    const grant = await this.prisma.roleOnPermission.create({
      data: { roleId, permissionPointId, createdBy: this.ctx.accountId! },
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
