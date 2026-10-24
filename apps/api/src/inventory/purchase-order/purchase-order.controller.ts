import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderLogisticsService } from './purchase-order-logistics.service';
import { Import1688CommitItem, PurchaseOrder1688ImportService } from './purchase-order-1688-import.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { CancelPurchaseOrderDto } from './dto/cancel-purchase-order.dto';
import { VersionDto } from './dto/version.dto';

class LogisticsDto {
  @IsOptional() @IsString() @MaxLength(20) platform?: string;
  @IsOptional() @IsString() @MaxLength(64) platformOrderNo?: string;
  @IsOptional() @IsString() @MaxLength(100) expressNo?: string;
  @IsOptional() @IsString() @MaxLength(40) expressCompany?: string;
  @IsOptional() @IsString() @MaxLength(8) expressPhoneTail?: string;
}

class Commit1688Dto {
  @IsArray() items: Import1688CommitItem[];
}

class ConfirmPurchaseDto {
  @IsInt() version: number;
  /** 快递/运单号（选填） */
  @IsOptional() @IsString() @MaxLength(100) expressNo?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@ApiTags('inventory/purchase-order')
@Controller('inventory/purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly logistics: PurchaseOrderLogisticsService,
    private readonly import1688: PurchaseOrder1688ImportService,
  ) {}

  /** 物流相关的下拉选项（快递公司、采购平台、状态名）和快递100是否已配置 */
  @Get('logistics-meta')
  @RequirePermission('inventory.purchase-order.view')
  logisticsMeta() {
    return this.logistics.meta();
  }

  /** 导入 1688 订单表第一步：上传导出的 xlsx，返回和采购单的智能对应结果（不写库） */
  @Post('import-1688/preview')
  @RequirePermission('inventory.purchase-order.purchase')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  import1688Preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择 1688 导出的订单 Excel 文件');
    return this.import1688.preview(file.buffer);
  }

  /** 第二步：用户核对后，把平台订单号/快递公司/运单号登记到采购单 */
  @Post('import-1688/commit')
  @RequirePermission('inventory.purchase-order.purchase')
  import1688Commit(@Body() dto: Commit1688Dto) {
    return this.import1688.commit(dto.items);
  }

  @Get()
  @RequirePermission('inventory.purchase-order.view')
  findAll(@Query() query: QueryPurchaseOrderDto) {
    return this.purchaseOrderService.findMany(query);
  }

  @Get(':id/shipments')
  @RequirePermission('inventory.purchase-order.view')
  shipments(@Param('id') id: string) {
    return this.logistics.shipments(id);
  }

  @Post(':id/shipments/refresh')
  @RequirePermission('inventory.purchase-order.view')
  refreshShipments(@Param('id') id: string) {
    return this.logistics.refreshShipments(id);
  }

  @Post(':id/shipments/:sid/refresh')
  @RequirePermission('inventory.purchase-order.view')
  refreshShipment(@Param('id') id: string, @Param('sid') sid: string) {
    return this.logistics.refreshShipment(id, sid);
  }

  @Get(':id/logistics')
  @RequirePermission('inventory.purchase-order.view')
  getLogistics(@Param('id') id: string) {
    return this.logistics.get(id);
  }

  /** 登记/修改采购平台、平台订单号、快递公司和单号（采购员） */
  @Patch(':id/logistics')
  @RequirePermission('inventory.purchase-order.purchase')
  updateLogistics(@Param('id') id: string, @Body() dto: LogisticsDto) {
    return this.logistics.updateInfo(id, dto);
  }

  /** 立刻查一次最新物流 */
  @Post(':id/logistics/refresh')
  @RequirePermission('inventory.purchase-order.view')
  refreshLogistics(@Param('id') id: string) {
    return this.logistics.refresh(id);
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

  /** 采购员确认已完成采购：采购单变“已采购”，并自动生成待收货的入库单 */
  @Post(':id/confirm-purchase')
  @RequirePermission('inventory.purchase-order.purchase')
  confirmPurchase(@Param('id') id: string, @Body() dto: ConfirmPurchaseDto) {
    return this.purchaseOrderService.confirmPurchase(id, { expressNo: dto.expressNo, note: dto.note }, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.purchase-order.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.purchaseOrderService.cancel(id, dto.cancelReason, dto.version);
  }
}
