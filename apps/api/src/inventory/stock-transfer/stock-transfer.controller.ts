import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StockTransferService } from './stock-transfer.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { QueryStockTransferDto } from './dto/query-stock-transfer.dto';
import { CancelStockTransferDto } from './dto/cancel-stock-transfer.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('inventory/stock-transfer')
@Controller('inventory/stock-transfers')
export class StockTransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  @Get()
  @RequirePermission('inventory.stock-transfer.view')
  findAll(@Query() query: QueryStockTransferDto) {
    return this.stockTransferService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('inventory.stock-transfer.view')
  findOne(@Param('id') id: string) {
    return this.stockTransferService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.stock-transfer.create')
  create(@Body() dto: CreateStockTransferDto) {
    return this.stockTransferService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('inventory.stock-transfer.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.stockTransferService.submit(id, dto.version);
  }

  @Post(':id/execute')
  @RequirePermission('inventory.stock-transfer.execute')
  execute(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.stockTransferService.execute(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.stock-transfer.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelStockTransferDto) {
    return this.stockTransferService.cancel(id, dto.cancelReason, dto.version);
  }
}
