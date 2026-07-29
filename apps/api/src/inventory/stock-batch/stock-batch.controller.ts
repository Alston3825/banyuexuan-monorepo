import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StockBatchService } from './stock-batch.service';
import { QueryStockBatchDto } from './dto/query-stock-batch.dto';

@ApiTags('inventory/stock-batch')
@Controller('inventory/stock-batches')
export class StockBatchController {
  constructor(private readonly stockBatchService: StockBatchService) {}

  @Get()
  @RequirePermission('inventory.stock-batch.view')
  findAll(@Query() query: QueryStockBatchDto) {
    return this.stockBatchService.findMany(query);
  }

  @Get('expiry-alerts')
  @RequirePermission('inventory.stock-batch.view')
  expiryAlerts(@Query('warehouseId') warehouseId?: string, @Query('withinDays') withinDays?: string) {
    return this.stockBatchService.expiryAlerts({ warehouseId, withinDays: withinDays ? Number(withinDays) : undefined });
  }
}
