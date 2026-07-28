import { Module } from '@nestjs/common';
import { DietaryRestrictionController } from './dietary-restriction.controller';
import { DietaryRestrictionService } from './dietary-restriction.service';

@Module({
  controllers: [DietaryRestrictionController],
  providers: [DietaryRestrictionService],
  exports: [DietaryRestrictionService],
})
export class DietaryRestrictionModule {}
