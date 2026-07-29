import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StockIssueService } from './stock-issue.service';
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { QueryStockIssueDto } from './dto/query-stock-issue.dto';
import { CancelStockIssueDto } from './dto/cancel-stock-issue.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('inventory/stock-issue')
@Controller('inventory/stock-issues')
export class StockIssueController {
  constructor(private readonly stockIssueService: StockIssueService) {}

  @Get()
  @RequirePermission('inventory.stock-issue.view')
  findAll(@Query() query: QueryStockIssueDto) {
    return this.stockIssueService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('inventory.stock-issue.view')
  findOne(@Param('id') id: string) {
    return this.stockIssueService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.stock-issue.create')
  create(@Body() dto: CreateStockIssueDto) {
    return this.stockIssueService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('inventory.stock-issue.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.stockIssueService.submit(id, dto.version);
  }

  @Post(':id/execute')
  @RequirePermission('inventory.stock-issue.execute')
  execute(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.stockIssueService.execute(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.stock-issue.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelStockIssueDto) {
    return this.stockIssueService.cancel(id, dto.cancelReason, dto.version);
  }
}
