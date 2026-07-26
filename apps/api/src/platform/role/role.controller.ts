import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { GrantPermissionDto } from './dto/grant-permission.dto';

@ApiTags('platform/role')
@Controller('platform/roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('platform.role.view')
  findAll() {
    return this.roleService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.role.view')
  findOne(@Param('id') id: string) {
    return this.roleService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.role.create')
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.role.update')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const { version, ...data } = dto;
    return this.roleService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.role.delete')
  remove(@Param('id') id: string) {
    return this.roleService.delete(id);
  }

  @Post(':id/permissions')
  @RequirePermission('platform.role.update')
  grantPermission(@Param('id') id: string, @Body() dto: GrantPermissionDto) {
    return this.roleService.grantPermission(id, dto.permissionPointId);
  }

  @Delete(':id/permissions/:permissionPointId')
  @RequirePermission('platform.role.update')
  revokePermission(@Param('id') id: string, @Param('permissionPointId') permissionPointId: string) {
    return this.roleService.revokePermission(id, permissionPointId);
  }
}
