import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareFormTemplateService } from './care-form-template.service';
import { CreateCareFormTemplateDto } from './dto/create-care-form-template.dto';
import { UpdateCareFormTemplateDto } from './dto/update-care-form-template.dto';
import { QueryCareFormTemplateDto } from './dto/query-care-form-template.dto';

@ApiTags('care/form-template')
@Controller('care/form-templates')
export class CareFormTemplateController {
  constructor(private readonly careFormTemplateService: CareFormTemplateService) {}

  @Get()
  @RequirePermission('care.form-template.view')
  findAll(@Query() query: QueryCareFormTemplateDto) {
    return this.careFormTemplateService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.form-template.view')
  findOne(@Param('id') id: string) {
    return this.careFormTemplateService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.form-template.create')
  create(@Body() dto: CreateCareFormTemplateDto) {
    return this.careFormTemplateService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.form-template.update')
  update(@Param('id') id: string, @Body() dto: UpdateCareFormTemplateDto) {
    return this.careFormTemplateService.update(id, dto);
  }
}
