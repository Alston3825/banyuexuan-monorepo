import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GoodsReceiptService } from './goods-receipt.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptDto } from './dto/query-goods-receipt.dto';
import { CancelGoodsReceiptDto } from './dto/cancel-goods-receipt.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('inventory/goods-receipt')
@Controller('inventory/goods-receipts')
export class GoodsReceiptController {
  constructor(private readonly goodsReceiptService: GoodsReceiptService) {}

  @Get()
  @RequirePermission('inventory.goods-receipt.view')
  findAll(@Query() query: QueryGoodsReceiptDto) {
    return this.goodsReceiptService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('inventory.goods-receipt.view')
  findOne(@Param('id') id: string) {
    return this.goodsReceiptService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.goods-receipt.create')
  create(@Body() dto: CreateGoodsReceiptDto) {
    return this.goodsReceiptService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('inventory.goods-receipt.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.goodsReceiptService.submit(id, dto.version);
  }

  @Post(':id/execute')
  @RequirePermission('inventory.goods-receipt.execute')
  execute(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.goodsReceiptService.execute(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.goods-receipt.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelGoodsReceiptDto) {
    return this.goodsReceiptService.cancel(id, dto.cancelReason, dto.version);
  }
}
