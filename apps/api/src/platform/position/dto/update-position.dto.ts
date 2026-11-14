import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdatePositionDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  // 之前编辑接口没有这个字段，新建时填的级别之后没法再调整——前端"编辑"表单本来就没有
  // 对应输入项，就算传了这个DTO不认识字段也会被class-validator悄悄丢弃，两边都要补。
  @ApiProperty({ required: false, description: '职级，0-8' }) @IsOptional() @IsInt() rank?: number;
  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
