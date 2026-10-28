import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WarehousePurpose } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { InventoryItemService } from './inventory-item.service';
import { ImportItemRow, InventoryItemImportService } from './inventory-item-import.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

class CommitImportDto {
  @IsArray() items: ImportItemRow[];
  @IsEnum(WarehousePurpose) purpose: WarehousePurpose;
  @IsOptional() @IsString() category?: string;
  @IsBoolean() updateExisting: boolean;
}

@ApiTags('inventory/item')
@Controller('inventory/items')
export class InventoryItemController {
  constructor(
    private readonly inventoryItemService: InventoryItemService,
    private readonly importService: InventoryItemImportService,
  ) {}

  /** Excel 导入第一步：上传表格，返回识别出的物品清单供核对（不入库） */
  @Post('import/preview')
  @RequirePermission('inventory.item.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importPreview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    return this.importService.preview(file.buffer);
  }

  /** Excel 导入第二步：确认后入库 */
  @Post('import/commit')
  @RequirePermission('inventory.item.create')
  importCommit(@Body() dto: CommitImportDto) {
    return this.importService.commit(dto);
  }

  /** 选物品的搜索框用：按名称/规格/品牌/编码模糊搜，最多 30 条。各种“新建申购单/采购单”都要用，登录即可查（只返回基础资料）。 */
  @Get('search')
  search(@Query('keyword') keyword?: string) {
    return this.inventoryItemService.search(keyword);
  }

  /** 新物品入库前查重：名称相近的已有物品（登录即可查，只返回基础资料） */
  @Get('similar')
  similar(@Query('name') name?: string, @Query('spec') spec?: string) {
    return this.inventoryItemService.similar(name, spec);
  }

  @Get()
  @RequirePermission('inventory.item.view')
  findAll() {
    return this.inventoryItemService.findMany();
  }

  @Get(':id')
  @RequirePermission('inventory.item.view')
  findOne(@Param('id') id: string) {
    return this.inventoryItemService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.item.create')
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryItemService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('inventory.item.update')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    const { version, ...data } = dto;
    return this.inventoryItemService.update(id, data, version);
  }
}
