import { Module } from '@nestjs/common';
import { CareFormTemplateController } from './care-form-template.controller';
import { CareFormTemplateService } from './care-form-template.service';

@Module({
  controllers: [CareFormTemplateController],
  providers: [CareFormTemplateService],
  exports: [CareFormTemplateService],
})
export class CareFormTemplateModule {}
