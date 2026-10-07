import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GoodsReceiptService } from './goods-receipt.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptDto } from './dto/query-goods-receipt.dto';
import { CancelGoodsReceiptDto } from './dto/cancel-goods-receipt.dto';
import { VersionDto } from './dto/version.dto';

class ReceiveLineDto {
  @IsString() @IsNotEmpty() receiptItemId: string;
  @IsInt() @Min(1) quantity: number;
  /** 这批货的到期日（选填，不填按物品保质期推算） */
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
class ReceiveDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveLineDto) lines: ReceiveLineDto[];
  @IsOptional() @IsString() @MaxLength(100) expressNo?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class CloseShortDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

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

  /** 收货确认：快递到货后，客服逐项确认到了哪几项、各多少（可分多次），确认即入库 */
  @Post(':id/receive')
  @RequirePermission('inventory.goods-receipt.receive')
  receive(@Param('id') id: string, @Body() dto: ReceiveDto) {
    return this.goodsReceiptService.receive(id, dto);
  }

  /** 个别货品不会再到：结束收货（写明原因），入库单和采购单标记完成 */
  @Post(':id/close-short')
  @RequirePermission('inventory.goods-receipt.receive')
  closeShort(@Param('id') id: string, @Body() dto: CloseShortDto) {
    return this.goodsReceiptService.closeShort(id, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.goods-receipt.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelGoodsReceiptDto) {
    return this.goodsReceiptService.cancel(id, dto.cancelReason, dto.version);
  }
}
