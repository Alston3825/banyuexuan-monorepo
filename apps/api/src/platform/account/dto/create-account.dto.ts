import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty() @IsString() username: string;
  @ApiProperty() @IsString() realName: string;
  @ApiProperty({ description: '初始密码' }) @IsString() @MinLength(6) password: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() departmentId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() teamId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() positionId?: string;
}
