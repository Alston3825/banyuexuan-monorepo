import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { WarehouseStockService } from './warehouse-stock.service';
import { QueryWarehouseStockDto } from './dto/query-warehouse-stock.dto';

@ApiTags('inventory/warehouse-stock')
@Controller('inventory/warehouse-stocks')
export class WarehouseStockController {
  constructor(private readonly warehouseStockService: WarehouseStockService) {}

  @Get()
  @RequirePermission('inventory.warehouse-stock.view')
  findAll(@Query() query: QueryWarehouseStockDto) {
    return this.warehouseStockService.findMany(query);
  }

  @Get('low-stock-alerts')
  @RequirePermission('inventory.warehouse-stock.view')
  lowStockAlerts(@Query('warehouseId') warehouseId?: string) {
    return this.warehouseStockService.lowStockAlerts({ warehouseId });
  }
}
