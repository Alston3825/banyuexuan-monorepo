import { Injectable } from '@nestjs/common';
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
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return binding;
  }
}
