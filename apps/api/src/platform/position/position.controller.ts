import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PositionService } from './position.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@ApiTags('platform/position')
@Controller('platform/positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  @RequirePermission('platform.position.view')
  findAll() {
    return this.positionService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.position.view')
  findOne(@Param('id') id: string) {
    return this.positionService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.position.create')
  create(@Body() dto: CreatePositionDto) {
    return this.positionService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.position.update')
  update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    const { version, ...data } = dto;
    return this.positionService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.position.delete')
  remove(@Param('id') id: string) {
    return this.positionService.delete(id);
  }
}
