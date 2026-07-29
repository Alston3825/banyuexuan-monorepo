import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@ApiTags('inventory/supplier')
@Controller('inventory/suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @RequirePermission('inventory.supplier.view')
  findAll() {
    return this.supplierService.findMany();
  }

  @Get(':id')
  @RequirePermission('inventory.supplier.view')
  findOne(@Param('id') id: string) {
    return this.supplierService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('inventory.supplier.create')
  create(@Body() dto: CreateSupplierDto) {
    return this.supplierService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('inventory.supplier.update')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    const { version, ...data } = dto;
    return this.supplierService.update(id, data, version);
  }
}
