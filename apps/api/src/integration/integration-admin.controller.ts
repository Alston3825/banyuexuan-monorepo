import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { IntegrationAdminService } from './integration-admin.service';

/** 后台管理接口（登录用户 + 权限点） */
@ApiTags('integration/admin')
@Controller('integration')
export class IntegrationAdminController {
  constructor(private readonly svc: IntegrationAdminService) {}

  @Get('systems') @RequirePermission('integration.system.view')
  systems() { return this.svc.listSystems(); }

  @Post('systems') @RequirePermission('integration.system.create')
  createSystem(@Body() dto: any) { return this.svc.createSystem(dto); }

  @Patch('systems/:id') @RequirePermission('integration.system.update')
  updateSystem(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSystem(id, dto); }

  @Post('systems/:id/reset-key') @RequirePermission('integration.system.update')
  resetKey(@Param('id') id: string) { return this.svc.resetKey(id); }

  // 房间设备绑定：门店业务岗位也要能维护，所以单独权限点，不挂在 system 下
  @Get('room-bindings') @RequirePermission('integration.binding.view')
  bindings(@Query('storeId') storeId?: string, @Query('roomId') roomId?: string) { return this.svc.listBindings(storeId, roomId); }

  @Post('room-bindings') @RequirePermission('integration.binding.update')
  addBinding(@Body() dto: any) { return this.svc.addBinding(dto); }

  @Delete('room-bindings/:id') @RequirePermission('integration.binding.update')
  removeBinding(@Param('id') id: string) { return this.svc.removeBinding(id); }

  @Get('service-codes') @RequirePermission('integration.system.view')
  serviceCodes() { return this.svc.listServiceCodes(); }

  @Post('service-codes') @RequirePermission('integration.system.update')
  upsertServiceCode(@Body() dto: any) { return this.svc.upsertServiceCode(dto); }

  @Get('calls') @RequirePermission('integration.system.view')
  calls(@Query() q: any) { return this.svc.listCalls({ ...q, take: q.take ? Number(q.take) : undefined }); }
}
