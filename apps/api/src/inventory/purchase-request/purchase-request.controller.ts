import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { PurchaseRequestStatus } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PurchaseRequestKind } from '@prisma/client';
import { RequestLineBody } from './purchase-request.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseRequestImportService, RequestImportRow } from './purchase-request-import.service';

class QueryDto {
  @IsOptional() @IsString() storeId?: string;
  @IsOptional() @IsEnum(PurchaseRequestStatus) status?: PurchaseRequestStatus;
  @IsOptional() @IsEnum(PurchaseRequestKind) kind?: PurchaseRequestKind;
}
class VersionDto {
  @ApiProperty() @IsInt() version: number;
}
class CancelDto extends VersionDto {
  @ApiProperty() @IsString() @IsNotEmpty() cancelReason: string;
}
class CommitImportDto {
  @IsString() storeId: string;
  @IsOptional() @IsString() requestDate?: string;
  @IsOptional() @IsString() sourceFileName?: string;
  @IsOptional() @IsString() remark?: string;
  @IsArray() rows: RequestImportRow[];
  @IsBoolean() createMissingItems: boolean;
  @IsBoolean() allowDuplicate: boolean;
}
class LineDto extends VersionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() spec?: string | null;
  @IsOptional() @IsString() brand?: string | null;
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number | null;
  @IsOptional() @IsString() department?: string | null;
  @IsOptional() @IsString() requester?: string | null;
  @IsOptional() @IsString() purpose?: string | null;
  @IsOptional() @IsString() remark?: string | null;
  @IsOptional() @IsString() itemId?: string | null;
}
class ConvertDto extends VersionDto {
  @IsString() @IsNotEmpty() supplierId: string;
  @IsString() @IsNotEmpty() warehouseId: string;
  @IsOptional() @IsArray() fixes?: { lineId: string; unitPrice?: number; itemId?: string }[];
}

class CreateDepartmentDto {
  @IsOptional() @IsString() storeId?: string;
  @IsOptional() @IsString() requestDate?: string;
  @IsOptional() @IsString() remark?: string;
  @IsArray() items: RequestLineBody[];
  /** true=保存并提交（交给客服汇总） */
  @IsOptional() @IsBoolean() submit?: boolean;
}
class CollectDto {
  @IsArray() @IsString({ each: true }) ids: string[];
  @IsOptional() @IsString() remark?: string;
}

@ApiTags('inventory/purchase-request')
@Controller('inventory/purchase-requests')
export class PurchaseRequestController {
  constructor(
    private readonly service: PurchaseRequestService,
    private readonly importService: PurchaseRequestImportService,
  ) {}

  @Get()
  @RequirePermission('inventory.purchase-request.view')
  findAll(@Query() query: QueryDto) {
    return this.service.findMany(query);
  }

  /** Excel 导入第一步：上传申购表，返回识别结果供核对（不入库） */
  @Post('import/preview')
  @RequirePermission('inventory.purchase-request.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importPreview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    return this.importService.preview(file.buffer);
  }

  /** 选了门店/日期后检查是不是已经导入过 */
  @Get('import/duplicate')
  @RequirePermission('inventory.purchase-request.create')
  duplicate(@Query('storeId') storeId: string, @Query('requestDate') requestDate: string) {
    return this.importService.checkDuplicate(storeId, requestDate);
  }

  /** Excel 导入第二步：确认后生成申购单（草稿） */
  @Post('import/commit')
  @RequirePermission('inventory.purchase-request.create')
  importCommit(@Body() dto: CommitImportDto) {
    return this.importService.commit(dto);
  }

  /** 部门负责人新建部门申购单（申请部门取自本人所在部门） */
  @Post('department')
  @RequirePermission('inventory.purchase-request.create')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.service.createDepartment(dto);
  }

  /** 客服汇总：把勾选的“已提交”部门申购单合并成一张汇总申购单 */
  @Post('collect')
  @RequirePermission('inventory.purchase-request.collect')
  collect(@Body() dto: CollectDto) {
    return this.service.collect(dto.ids, dto.remark);
  }

  @Get(':id')
  @RequirePermission('inventory.purchase-request.view')
  findOne(@Param('id') id: string) {
    return this.service.findOneOrThrow(id);
  }

  @Post(':id/items')
  @RequirePermission('inventory.purchase-request.update')
  addLine(@Param('id') id: string, @Body() dto: LineDto) {
    const { version, ...body } = dto;
    return this.service.addLine(id, body, version);
  }

  @Patch(':id/items/:lineId')
  @RequirePermission('inventory.purchase-request.update')
  updateLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: LineDto) {
    const { version, ...body } = dto;
    return this.service.updateLine(id, lineId, body, version);
  }

  @Delete(':id/items/:lineId')
  @RequirePermission('inventory.purchase-request.update')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string, @Query('version') version: string) {
    return this.service.removeLine(id, lineId, Number(version));
  }

  @Post(':id/submit')
  @RequirePermission('inventory.purchase-request.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.service.submit(id, dto.version);
  }

  @Post(':id/recall')
  @RequirePermission('inventory.purchase-request.submit')
  recall(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.service.recall(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.purchase-request.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelDto) {
    return this.service.cancel(id, dto.cancelReason, dto.version);
  }

  @Post(':id/convert')
  @RequirePermission('inventory.purchase-request.convert')
  convert(@Param('id') id: string, @Body() dto: ConvertDto) {
    return this.service.convert(id, { supplierId: dto.supplierId, warehouseId: dto.warehouseId, fixes: dto.fixes }, dto.version);
  }
}
