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

  /** 库存总览：每种物品一行（含没入过库的，数量 0），带预警状态、汇总；支持搜索和按状态筛选 */
  @Get('overview')
  @RequirePermission('inventory.warehouse-stock.view')
  overview(@Query('warehouseId') warehouseId?: string, @Query('keyword') keyword?: string, @Query('status') status?: string) {
    const st = ['ALL', 'ALERT', 'LOW', 'OUT', 'IN_STOCK'].includes(status ?? '') ? (status as 'ALL' | 'ALERT' | 'LOW' | 'OUT' | 'IN_STOCK') : 'ALL';
    return this.warehouseStockService.overview({ warehouseId: warehouseId || undefined, keyword, status: st });
  }

  @Get('low-stock-alerts')
  @RequirePermission('inventory.warehouse-stock.view')
  lowStockAlerts(@Query('warehouseId') warehouseId?: string) {
    return this.warehouseStockService.lowStockAlerts({ warehouseId });
  }
}
