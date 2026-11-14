import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionService } from './permission.service';

@ApiTags('platform/permission')
@Controller('platform/permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @RequirePermission('platform.permission.view')
  findAll() {
    return this.permissionService.findMany();
  }
}
