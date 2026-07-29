import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CustomerServicePackageService } from './customer-service-package.service';
import { CreateCustomerServicePackageDto } from './dto/create-customer-service-package.dto';
import { QueryCustomerServicePackageDto } from './dto/query-customer-service-package.dto';
import { QueryCustomerServicePackageReportDto } from './dto/query-customer-service-package-report.dto';

@ApiTags('service/customer-package')
@Controller('service/customer-packages')
export class CustomerServicePackageController {
  constructor(private readonly customerServicePackageService: CustomerServicePackageService) {}

  @Get()
  @RequirePermission('service.customer-package.view')
  findAll(@Query() query: QueryCustomerServicePackageDto) {
    return this.customerServicePackageService.findMany(query);
  }

  // 必须在 :id 路由之前注册，否则 "report" 会被当作 id 匹配到 findOne。
  @Get('report')
  @RequirePermission('service.customer-package.view')
  report(@Query() query: QueryCustomerServicePackageReportDto) {
    return this.customerServicePackageService.report(query);
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
