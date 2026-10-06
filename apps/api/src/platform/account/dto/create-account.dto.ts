import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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
  @ApiProperty({ required: false, enum: ['ACTIVE', 'DISABLED'], description: '默认正常' }) @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED';
  // 两个都填才会顺带建员工档案（一个账号只能对应一个员工档案，业务规则确认记录
  // "账号与员工档案关联"一节）：都不填=只建登录账号（少数不算真实员工的账号，如
  // 第三方对接账号），前端"新建账号"表单默认要求填，避免以后又要单独跑一遍
  // 员工档案模块补录，造成两个入口都要录一遍数据的问题。
  @ApiProperty({ required: false, description: '同时建立员工档案时必填' }) @IsOptional() @IsString() employeeNo?: string;
  @ApiProperty({ required: false, description: '同时建立员工档案时必填' }) @IsOptional() @IsDateString() hireDate?: string;
}
