import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestContextService } from '../common/context/request-context.service';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  @Get()
  @RequirePermission('audit.log.view')
  findMany(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findMany({ ...query, tenantId: this.ctx.tenantId });
  }
}
