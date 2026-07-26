import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'STATE_TRANSITION',
  'APPROVE',
  'REJECT',
  'WITHDRAW',
  'REASSIGN',
  'ADD_APPROVER',
  'CC',
  'ARCHIVE',
  'SENSITIVE_QUERY',
  'EXPORT',
  'PRINT',
] as const;

export class QueryAuditLogDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() entityType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() entityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() accountId?: string;
  @ApiProperty({ required: false, enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: (typeof AUDIT_ACTIONS)[number];

  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;
}
