import { Injectable } from '@nestjs/common';
import { Therapist } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { QueryTherapistDto } from './dto/query-therapist.dto';

@Injectable()
export class TherapistService extends BaseScopedCrudService<Therapist> {
  protected readonly entityType = 'Therapist';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.therapist;
  }

  findMany(query: QueryTherapistDto = {}): Promise<Therapist[]> {
    return this.prisma.therapist.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: { storeId: string; name: string; phone?: string }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
