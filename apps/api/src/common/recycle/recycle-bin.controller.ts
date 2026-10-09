import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { RecycleBinService } from './recycle-bin.service';

@ApiTags('recycle-bin')
@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly service: RecycleBinService) {}

  @Get()
  @RequirePermission('crm.customer.restore')
  list(@Query('entityType') entityType?: string) {
    return this.service.list(entityType);
  }

  @Post(':id/restore')
  @RequirePermission('crm.customer.restore')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('crm.customer.restore')
  purge(@Param('id') id: string) {
    return this.service.purge(id);
  }
}
