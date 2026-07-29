import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ShiftDefinitionService } from './shift-definition.service';
import { CreateShiftDefinitionDto } from './dto/create-shift-definition.dto';
import { UpdateShiftDefinitionDto } from './dto/update-shift-definition.dto';
import { QueryShiftDefinitionDto } from './dto/query-shift-definition.dto';

@ApiTags('hr/shift-definition')
@Controller('hr/shift-definitions')
export class ShiftDefinitionController {
  constructor(private readonly shiftDefinitionService: ShiftDefinitionService) {}

  @Get()
  @RequirePermission('hr.shift-definition.view')
  findAll(@Query() query: QueryShiftDefinitionDto) {
    return this.shiftDefinitionService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('hr.shift-definition.view')
  findOne(@Param('id') id: string) {
    return this.shiftDefinitionService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('hr.shift-definition.create')
  create(@Body() dto: CreateShiftDefinitionDto) {
    return this.shiftDefinitionService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('hr.shift-definition.update')
  update(@Param('id') id: string, @Body() dto: UpdateShiftDefinitionDto) {
    const { version, ...data } = dto;
    return this.shiftDefinitionService.update(id, data, version);
  }
}
