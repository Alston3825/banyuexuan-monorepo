import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SelectMealRecordDto {
  @ApiProperty({ description: '客户自选的菜品 ID' })
  @IsString()
  mealItemId: string;
}
