import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './context/request-context.service';
import { PermissionLookupService } from './context/permission-lookup.service';
import { DataScopeService } from './scope/data-scope.service';
import { AuditLogModule } from '../audit/audit-log.module';

@Global()
@Module({
  imports: [AuditLogModule],
  providers: [RequestContextService, PermissionLookupService, DataScopeService],
  exports: [RequestContextService, PermissionLookupService, DataScopeService, AuditLogModule],
})
export class CommonModule {}
