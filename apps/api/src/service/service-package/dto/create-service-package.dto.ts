import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateServicePackageDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ description: '总次数' }) @IsInt() @Min(1) totalSessions: number;
  @ApiProperty({ description: '套餐总价（最小货币单位）' }) @IsInt() @Min(0) price: number;
}
