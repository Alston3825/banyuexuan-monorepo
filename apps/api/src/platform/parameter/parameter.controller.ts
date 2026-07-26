import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParameterService } from './parameter.service';
import { CreateParameterDto } from './dto/create-parameter.dto';
import { UpdateParameterDto } from './dto/update-parameter.dto';

@ApiTags('platform/parameter')
@Controller('platform/parameters')
export class ParameterController {
  constructor(private readonly parameterService: ParameterService) {}

  @Get()
  @RequirePermission('platform.parameter.view')
  findAll() {
    return this.parameterService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.parameter.view')
  findOne(@Param('id') id: string) {
    return this.parameterService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.parameter.create')
  create(@Body() dto: CreateParameterDto) {
    return this.parameterService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.parameter.update')
  update(@Param('id') id: string, @Body() dto: UpdateParameterDto) {
    const { version, ...data } = dto;
    return this.parameterService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.parameter.delete')
  remove(@Param('id') id: string) {
    return this.parameterService.delete(id);
  }
}
