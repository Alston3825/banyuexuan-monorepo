import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { QueryWarehouseDto } from './dto/query-warehouse.dto';

@ApiTags('inventory/warehouse')
@Controller('inventory/warehouses')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  @RequirePermission('inventory.warehouse.view')
  findAll(@Query() query: QueryWarehouseDto) {
    return this.warehouseService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('inventory.warehouse.view')
  findOne(@Param('id') id: string) {
    return this.warehouseService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.warehouse.create')
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('inventory.warehouse.update')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    const { version, ...data } = dto;
    return this.warehouseService.update(id, data, version);
  }
}
