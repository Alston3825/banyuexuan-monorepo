import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SetCustomerTagDto {
  @ApiProperty({ description: '标签分类，如 CUSTOMER_CLASSIFICATION / CUSTOMER_TYPE' })
  @IsString()
  category: string;

  @ApiProperty({ description: '标签ID' })
  @IsString()
  tagId: string;
}
