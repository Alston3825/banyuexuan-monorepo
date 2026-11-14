import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MaskEntity } from '../../common/decorators/mask-entity.decorator';
import { AuditSensitiveQuery } from '../../common/decorators/audit-sensitive-query.decorator';
import { AccountService } from './account.service';
import { AccountImportService, ImportRow } from './account-import.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

class CommitImportDto {
  @IsArray() rows: ImportRow[];
  @IsString() storeId: string;
  @IsBoolean() createMissing: boolean;
  @IsOptional() @IsString() roleId?: string;
  @IsBoolean() importProfileDetails: boolean;
}

@ApiTags('platform/account')
@Controller('platform/accounts')
@MaskEntity('Account')
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly importService: AccountImportService,
  ) {}

  /** 员工信息表（Excel）批量开通账号 第一步：读表并检查，返回逐行结果供核对（不开通） */
  @Post('import/preview')
  @RequirePermission('platform.account.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importPreview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    return this.importService.preview(file.buffer);
  }

  /** 第二步：确认后批量开通（手机号作用户名，初始密码统一，工号/手机号不重复） */
  @Post('import/commit')
  @RequirePermission('platform.account.create')
  importCommit(@Body() dto: CommitImportDto) {
    return this.importService.commit(dto);
  }

  @Get()
  @RequirePermission('platform.account.view')
  @AuditSensitiveQuery()
  findAll() {
    return this.accountService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.account.view')
  @AuditSensitiveQuery()
  findOne(@Param('id') id: string) {
    return this.accountService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.account.create')
  create(@Body() dto: CreateAccountDto) {
    return this.accountService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.account.update')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    const { version, ...data } = dto;
    return this.accountService.update(id, data, version);
  }

  @Patch(':id/password')
  @RequirePermission('platform.account.update')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.accountService.resetPassword(id, dto.newPassword);
  }

  @Post(':id/role-assignments')
  @RequirePermission('platform.account.update')
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.accountService.assignRole(id, dto.roleId, dto.scopeType, dto.scopeIds?.length ? dto.scopeIds : dto.scopeId ? [dto.scopeId] : []);
  }

  @Delete(':id/role-assignments/:assignmentId')
  @RequirePermission('platform.account.update')
  revokeRoleAssignment(@Param('id') id: string, @Param('assignmentId') assignmentId: string) {
    return this.accountService.revokeRoleAssignment(id, assignmentId);
  }

  @Delete(':id')
  @RequirePermission('platform.account.delete')
  remove(@Param('id') id: string) {
    return this.accountService.remove(id);
  }
}
