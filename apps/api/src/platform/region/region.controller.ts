import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RegionService } from './region.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

@ApiTags('platform/region')
@Controller('platform/regions')
export class RegionController {
  constructor(private readonly regionService: RegionService) {}

  @Get()
  @RequirePermission('platform.region.view')
  findAll() {
    return this.regionService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.region.view')
  findOne(@Param('id') id: string) {
    return this.regionService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.region.create')
  create(@Body() dto: CreateRegionDto) {
    return this.regionService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.region.update')
  update(@Param('id') id: string, @Body() dto: UpdateRegionDto) {
    const { version, ...data } = dto;
    return this.regionService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.region.delete')
  remove(@Param('id') id: string) {
    return this.regionService.delete(id);
  }
}
