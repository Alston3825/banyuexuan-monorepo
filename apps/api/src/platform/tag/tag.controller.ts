import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { BindTagDto } from './dto/bind-tag.dto';

@ApiTags('platform/tag')
@Controller('platform/tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  @RequirePermission('platform.tag.view')
  findAll() {
    return this.tagService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.tag.view')
  findOne(@Param('id') id: string) {
    return this.tagService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.tag.create')
  create(@Body() dto: CreateTagDto) {
    return this.tagService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.tag.update')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    const { version, ...data } = dto;
    return this.tagService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.tag.delete')
  remove(@Param('id') id: string) {
    return this.tagService.delete(id);
  }

  @Post(':id/bindings')
  @RequirePermission('platform.tag.update')
  bind(@Param('id') id: string, @Body() dto: BindTagDto) {
    return this.tagService.bind(id, dto.entityType, dto.entityId);
  }
}
