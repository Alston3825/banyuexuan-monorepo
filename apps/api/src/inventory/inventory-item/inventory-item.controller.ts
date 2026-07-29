import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { InventoryItemService } from './inventory-item.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@ApiTags('inventory/item')
@Controller('inventory/items')
export class InventoryItemController {
  constructor(private readonly inventoryItemService: InventoryItemService) {}

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
