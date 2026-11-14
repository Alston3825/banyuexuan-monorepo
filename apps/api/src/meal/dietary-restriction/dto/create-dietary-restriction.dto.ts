import { ApiProperty } from '@nestjs/swagger';
import { DietaryRestrictionCategory } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateDietaryRestrictionDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: DietaryRestrictionCategory }) @IsEnum(DietaryRestrictionCategory) category: DietaryRestrictionCategory;
}
