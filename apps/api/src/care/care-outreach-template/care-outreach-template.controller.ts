import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareOutreachTemplateService } from './care-outreach-template.service';
import { CreateCareOutreachTemplateDto } from './dto/create-care-outreach-template.dto';
import { UpdateCareOutreachTemplateDto } from './dto/update-care-outreach-template.dto';

@ApiTags('care/outreach-template')
@Controller('care/outreach-templates')
export class CareOutreachTemplateController {
  constructor(private readonly careOutreachTemplateService: CareOutreachTemplateService) {}

  @Get()
  @RequirePermission('care.outreach-template.view')
  findAll() {
    return this.careOutreachTemplateService.findMany();
  }

  @Get(':id')
  @RequirePermission('care.outreach-template.view')
  findOne(@Param('id') id: string) {
    return this.careOutreachTemplateService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.outreach-template.create')
  create(@Body() dto: CreateCareOutreachTemplateDto) {
    return this.careOutreachTemplateService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.outreach-template.update')
  update(@Param('id') id: string, @Body() dto: UpdateCareOutreachTemplateDto) {
    return this.careOutreachTemplateService.update(id, dto);
  }
}
