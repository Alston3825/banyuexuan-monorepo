import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareFieldDefinitionService } from './care-field-definition.service';
import { CreateCareFieldDefinitionDto } from './dto/create-care-field-definition.dto';
import { UpdateCareFieldDefinitionDto } from './dto/update-care-field-definition.dto';
import { QueryCareFieldDefinitionDto } from './dto/query-care-field-definition.dto';

@ApiTags('care/field')
@Controller('care/fields')
export class CareFieldDefinitionController {
  constructor(private readonly careFieldDefinitionService: CareFieldDefinitionService) {}

  @Get()
  @RequirePermission('care.field.view')
  findAll(@Query() query: QueryCareFieldDefinitionDto) {
    return this.careFieldDefinitionService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.field.view')
  findOne(@Param('id') id: string) {
    return this.careFieldDefinitionService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.field.create')
  create(@Body() dto: CreateCareFieldDefinitionDto) {
    return this.careFieldDefinitionService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.field.update')
  update(@Param('id') id: string, @Body() dto: UpdateCareFieldDefinitionDto) {
    const { version, ...data } = dto;
    return this.careFieldDefinitionService.update(id, data, version);
  }
}
