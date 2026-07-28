import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ServiceProductService } from './service-product.service';
import { CreateServiceProductDto } from './dto/create-service-product.dto';
import { UpdateServiceProductDto } from './dto/update-service-product.dto';

@ApiTags('service/product')
@Controller('service/products')
export class ServiceProductController {
  constructor(private readonly serviceProductService: ServiceProductService) {}

  @Get()
  @RequirePermission('service.product.view')
  findAll() {
    return this.serviceProductService.findMany();
  }

  @Get(':id')
  @RequirePermission('service.product.view')
  findOne(@Param('id') id: string) {
    return this.serviceProductService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('service.product.create')
  create(@Body() dto: CreateServiceProductDto) {
    return this.serviceProductService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('service.product.update')
  update(@Param('id') id: string, @Body() dto: UpdateServiceProductDto) {
    const { version, ...data } = dto;
    return this.serviceProductService.update(id, data, version);
  }
}
