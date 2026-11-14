import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { SatisfactionTemplateService, TemplateInput } from './satisfaction-template.service';

class TemplateDto implements TemplateInput {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsInt() day?: number | null;
  @IsOptional() @IsString() goodWord?: string;
  @IsOptional() @IsString() badWord?: string;
  @IsOptional() @IsString() suggestionLabel?: string;
  @IsOptional() @IsString() praiseLabel?: string;
  @IsOptional() @IsArray() groups?: unknown;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @Type(() => Number) @IsInt() version?: number;
}

@ApiTags('satisfaction')
@Controller('satisfaction/templates')
export class SatisfactionTemplateController {
  constructor(private readonly service: SatisfactionTemplateService) {}

  @Get()
  @RequirePermission('satisfaction.template.view')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission('satisfaction.template.create')
  create(@Body() dto: TemplateDto) {
    return this.service.create(dto);
  }

  /** 上传 Word / Excel / PDF / 图片，自动生成一份“停用”的模板草稿 */
  @Post('import')
  @RequirePermission('satisfaction.template.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  importFile(@UploadedFile() file: Express.Multer.File) {
    return this.service.importFile(file);
  }

  @Get(':id')
  @RequirePermission('satisfaction.template.view')
  findOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Patch(':id')
  @RequirePermission('satisfaction.template.update')
  update(@Param('id') id: string, @Body() dto: TemplateDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/duplicate')
  @RequirePermission('satisfaction.template.create')
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('satisfaction.template.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
