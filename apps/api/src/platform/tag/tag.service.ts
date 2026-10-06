import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { Tag } from '@prisma/client';

@Injectable()
export class TagService extends BaseScopedCrudService<Tag> {
  protected readonly entityType = 'Tag';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.tag;
  }

  create(data: { name: string; color?: string; category?: string }): Promise<Tag> {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }

  /** 多态挂接：把标签打在任意实体上（entityType + entityId）。 */
  async bind(tagId: string, entityType: string, entityId: string) {
    await this.findOneOrThrow(tagId);
    const binding = await this.prisma.tagBinding.create({
      data: { tagId, entityType, entityId, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'TagBinding',
      entityId: binding.id,
      afterData: binding,
      ...this.bindingAuditCtx(),
    });
    return binding;
  }

  /** 撤销一次绑定：软删（记revokedAt），不物理删除，保留"这条标签曾经生效过"的历史。 */
  async unbind(bindingId: string) {
    const binding = await this.prisma.tagBinding.update({
      where: { id: bindingId },
      data: { revokedAt: new Date() },
    });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'TagBinding',
      entityId: bindingId,
      afterData: binding,
      ...this.bindingAuditCtx(),
    });
    return binding;
  }

  /**
   * 按分类查标签目录（比如给客户分类/客户类型选择器填选项用）——特意不要求
   * platform.tag.view权限，店长/普通员工没有platform.*权限但需要能看到这些选项，
   * 见 CustomerController 里调这个方法时用的是 crm.customer.*，同 listActiveBindings。
   */
  listByCategory(category: string) {
    return this.prisma.tag.findMany({ where: { category }, orderBy: { createdAt: 'asc' } });
  }

  /** 某个实体身上当前生效的全部标签绑定（revokedAt为空），带完整标签信息。 */
  listActiveBindings(entityType: string, entityId: string) {
    return this.prisma.tagBinding.findMany({
      where: { entityType, entityId, revokedAt: null },
      include: { tag: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 某个实体 + 某个标签分类下的完整变更历史（含已撤销的），用于"改动记录汇总统计"。 */
  listBindingHistory(entityType: string, entityId: string, category?: string) {
    return this.prisma.tagBinding.findMany({
      where: { entityType, entityId, ...(category ? { tag: { category } } : {}) },
      include: { tag: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 单选型标签分类专用（比如客户分类A-E、客户类型标签）：一个实体在同一个分类下
   * 同一时刻只应该有一条生效绑定。设置新标签时，先把该分类下其它还生效的绑定标记
   * 撤销（保留历史），再建新绑定——不是"删旧建新"，物理删除会丢失"什么时候从A类
   * 换成B类"这条改动记录，客户标签变更历史/后续汇总统计就无从谈起了。
   */
  async setExclusiveTag(entityType: string, entityId: string, category: string, newTagId: string) {
    const newTag = await this.findOneOrThrow(newTagId);
    if (newTag.category !== category) {
      throw new NotFoundException(`标签 ${newTagId} 不属于分类 ${category}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const currentActive = await tx.tagBinding.findMany({
        where: { entityType, entityId, revokedAt: null, tag: { category } },
      });
      const now = new Date();
      for (const b of currentActive) {
        if (b.tagId === newTagId) continue; // 选的就是当前生效的那个，不用动
        await tx.tagBinding.update({ where: { id: b.id }, data: { revokedAt: now } });
      }
      const alreadyActive = currentActive.some((b) => b.tagId === newTagId);
      if (alreadyActive) return tx.tagBinding.findFirst({ where: { entityType, entityId, tagId: newTagId, revokedAt: null }, include: { tag: true } });
      const created = await tx.tagBinding.create({
        data: { tagId: newTagId, entityType, entityId, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
        include: { tag: true },
      });
      await this.auditLogService.record({
        action: 'CREATE',
        entityType: 'TagBinding',
        entityId: created.id,
        afterData: created,
        remark: `分类"${category}"标签变更为"${newTag.name}"`,
        ...this.bindingAuditCtx(),
      });
      return created;
    });
  }

  private bindingAuditCtx() {
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
