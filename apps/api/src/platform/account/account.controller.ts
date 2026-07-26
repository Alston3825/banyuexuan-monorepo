import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MaskEntity } from '../../common/decorators/mask-entity.decorator';
import { AuditSensitiveQuery } from '../../common/decorators/audit-sensitive-query.decorator';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@ApiTags('platform/account')
@Controller('platform/accounts')
@MaskEntity('Account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

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
    return this.accountService.assignRole(id, dto.roleId, dto.scopeType, dto.scopeId);
  }

  @Delete(':id/role-assignments/:assignmentId')
  @RequirePermission('platform.account.update')
  revokeRoleAssignment(@Param('assignmentId') assignmentId: string) {
    return this.accountService.revokeRoleAssignment(assignmentId);
  }
}
