import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceProductDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @ApiProperty({ required: false, description: '单次散卖价（最小货币单位），仅按套餐消耗的项目可不设' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number;
}
