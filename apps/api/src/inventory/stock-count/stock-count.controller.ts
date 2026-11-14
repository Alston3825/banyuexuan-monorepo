import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StockCountService } from './stock-count.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryStockCountDto } from './dto/query-stock-count.dto';
import { CancelStockCountDto } from './dto/cancel-stock-count.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('inventory/stock-count')
@Controller('inventory/stock-counts')
export class StockCountController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Get()
  @RequirePermission('inventory.stock-count.view')
  findAll(@Query() query: QueryStockCountDto) {
    return this.stockCountService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('inventory.stock-count.view')
  findOne(@Param('id') id: string) {
    return this.stockCountService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.stock-count.create')
  create(@Body() dto: CreateStockCountDto) {
    return this.stockCountService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('inventory.stock-count.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.stockCountService.submit(id, dto.version);
  }

  @Post(':id/execute')
  @RequirePermission('inventory.stock-count.execute')
  execute(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.stockCountService.execute(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.stock-count.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelStockCountDto) {
    return this.stockCountService.cancel(id, dto.cancelReason, dto.version);
  }
}
