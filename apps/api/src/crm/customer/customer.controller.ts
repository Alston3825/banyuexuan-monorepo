import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MaskEntity } from '../../common/decorators/mask-entity.decorator';
import { AuditSensitiveQuery } from '../../common/decorators/audit-sensitive-query.decorator';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@ApiTags('crm/customer')
@Controller('crm/customers')
@MaskEntity('Customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @RequirePermission('crm.customer.view')
  @AuditSensitiveQuery()
  findAll(@Query() query: QueryCustomerDto) {
    return this.customerService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('crm.customer.view')
  @AuditSensitiveQuery()
  findOne(@Param('id') id: string) {
    return this.customerService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('crm.customer.create')
  create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('crm.customer.update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    const { version, ...data } = dto;
    return this.customerService.update(id, data, version);
  }
}
