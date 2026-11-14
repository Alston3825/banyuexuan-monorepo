import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyGuard } from './api-key.guard';
import { IntegrationAdminController } from './integration-admin.controller';
import { IntegrationAdminService } from './integration-admin.service';
import { IntegrationEventsService } from './integration-events.service';
import { IntegrationPublicController } from './integration-public.controller';
import { IntegrationPublicService } from './integration-public.service';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationAdminController, IntegrationPublicController],
  providers: [ApiKeyGuard, IntegrationAdminService, IntegrationPublicService, IntegrationEventsService],
  exports: [IntegrationEventsService],
})
export class IntegrationModule {}
