import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PurchaseOrderService } from './purchase-order.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { CancelPurchaseOrderDto } from './dto/cancel-purchase-order.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('inventory/purchase-order')
@Controller('inventory/purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Get()
  @RequirePermission('inventory.purchase-order.view')
  findAll(@Query() query: QueryPurchaseOrderDto) {
    return this.purchaseOrderService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('inventory.purchase-order.view')
  findOne(@Param('id') id: string) {
    return this.purchaseOrderService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.purchase-order.create')
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrderService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('inventory.purchase-order.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.purchaseOrderService.submit(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.purchase-order.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.purchaseOrderService.cancel(id, dto.cancelReason, dto.version);
  }
}
