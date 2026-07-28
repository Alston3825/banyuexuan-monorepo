import { Module } from '@nestjs/common';
import { CareFieldDefinitionModule } from './care-field-definition/care-field-definition.module';
import { CareFormTemplateModule } from './care-form-template/care-form-template.module';
import { CarePlanTemplateModule } from './care-plan-template/care-plan-template.module';
import { MotherProfileModule } from './mother-profile/mother-profile.module';
import { BabyProfileModule } from './baby-profile/baby-profile.module';
import { CarePlanModule } from './care-plan/care-plan.module';
import { CareRecordModule } from './care-record/care-record.module';
import { CareAbnormalityModule } from './care-abnormality/care-abnormality.module';

@Module({
  imports: [
    CareFieldDefinitionModule,
    CareFormTemplateModule,
    CarePlanTemplateModule,
    MotherProfileModule,
    BabyProfileModule,
    CarePlanModule,
    CareRecordModule,
    CareAbnormalityModule,
  ],
})
export class CareModule {}
