import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CustomerServicePackageService } from './customer-service-package.service';
import { CreateCustomerServicePackageDto } from './dto/create-customer-service-package.dto';
import { QueryCustomerServicePackageDto } from './dto/query-customer-service-package.dto';

@ApiTags('service/customer-package')
@Controller('service/customer-packages')
export class CustomerServicePackageController {
  constructor(private readonly customerServicePackageService: CustomerServicePackageService) {}

  @Get()
  @RequirePermission('service.customer-package.view')
  findAll(@Query() query: QueryCustomerServicePackageDto) {
    return this.customerServicePackageService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('service.customer-package.view')
  findOne(@Param('id') id: string) {
    return this.customerServicePackageService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('service.customer-package.create')
  create(@Body() dto: CreateCustomerServicePackageDto) {
    return this.customerServicePackageService.create(dto);
  }
}
