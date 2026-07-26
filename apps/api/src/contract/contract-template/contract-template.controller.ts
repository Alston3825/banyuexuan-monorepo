import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ContractTemplateService } from './contract-template.service';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto';
import { UpdateContractTemplateDto } from './dto/update-contract-template.dto';

@ApiTags('contract/template')
@Controller('contract/templates')
export class ContractTemplateController {
  constructor(private readonly contractTemplateService: ContractTemplateService) {}

  @Get()
  @RequirePermission('contract.template.view')
  findAll() {
    return this.contractTemplateService.findMany();
  }

  @Get(':id')
  @RequirePermission('contract.template.view')
  findOne(@Param('id') id: string) {
    return this.contractTemplateService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('contract.template.create')
  create(@Body() dto: CreateContractTemplateDto) {
    return this.contractTemplateService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('contract.template.update')
  update(@Param('id') id: string, @Body() dto: UpdateContractTemplateDto) {
    const { version, ...data } = dto;
    return this.contractTemplateService.update(id, data, version);
  }
}
