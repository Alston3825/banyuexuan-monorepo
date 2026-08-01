import { Module } from '@nestjs/common';
import { CareOutreachTemplateController } from './care-outreach-template.controller';
import { CareOutreachTemplateService } from './care-outreach-template.service';

@Module({
  controllers: [CareOutreachTemplateController],
  providers: [CareOutreachTemplateService],
  exports: [CareOutreachTemplateService],
})
export class CareOutreachTemplateModule {}
