import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('platform/application')
@Controller('platform/applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  @RequirePermission('platform.application.view')
  findAll() {
    return this.applicationService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.application.view')
  findOne(@Param('id') id: string) {
    return this.applicationService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.application.create')
  create(@Body() dto: CreateApplicationDto) {
    return this.applicationService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.application.update')
  update(@Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    const { version, ...data } = dto;
    return this.applicationService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.application.delete')
  remove(@Param('id') id: string) {
    return this.applicationService.delete(id);
  }
}
