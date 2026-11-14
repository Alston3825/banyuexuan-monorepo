import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, StreamableFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { SatisfactionService, SurveyPatch } from './satisfaction.service';

const MAX_FILE_BYTES = 30 * 1024 * 1024;

class FilterDto {
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() storeId?: string;
  @IsOptional() @IsString() steward?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string;
}
class CreateDto {
  @IsString() templateId: string;
  @IsOptional() @IsString() customerId?: string;
}
class PatchDto implements SurveyPatch {
  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsString() customerName?: string | null;
  @IsOptional() @IsString() roomNo?: string | null;
  @IsOptional() @IsString() stewardName?: string | null;
  @IsOptional() @IsString() nurseName?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() surveyDate?: string | null;
  @IsOptional() @IsObject() scores?: Record<string, number | null>;
  @IsOptional() @IsString() suggestion?: string | null;
  @IsOptional() @IsString() praise?: string | null;
}

@ApiTags('satisfaction')
@Controller('satisfaction/surveys')
export class SatisfactionController {
  constructor(private readonly service: SatisfactionService) {}

  @Get('specs')
  @RequirePermission('satisfaction.survey.view')
  specs() {
    return this.service.specs();
  }

  @Get('stats')
  @RequirePermission('satisfaction.survey.view')
  stats(@Query() q: FilterDto) {
    return this.service.stats(q);
  }

  @Get('comments')
  @RequirePermission('satisfaction.survey.view')
  comments(@Query() q: FilterDto) {
    return this.service.comments(q);
  }

  @Post('summarize')
  @RequirePermission('satisfaction.survey.view')
  summarize(@Body() q: FilterDto) {
    return this.service.summarize(q);
  }

  @Get()
  @RequirePermission('satisfaction.survey.view')
  list(@Query() q: FilterDto) {
    return this.service.list(q);
  }

  /** 上传纸质调查表照片（同一份的多张一起传）；不传照片就是手工录入 */
  @Post()
  @RequirePermission('satisfaction.survey.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: MAX_FILE_BYTES } }))
  create(@UploadedFiles() files: Express.Multer.File[], @Body() dto: CreateDto) {
    return this.service.create(files, dto);
  }

  @Get(':id')
  @RequirePermission('satisfaction.survey.view')
  findOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Get(':id/files/:fileId')
  @RequirePermission('satisfaction.survey.view')
  async file(@Param('id') id: string, @Param('fileId') fileId: string, @Res({ passthrough: true }) res: Response) {
    const { stream, size, mimeType, fileName } = await this.service.openFile(id, fileId);
    res.set({ 'Content-Type': mimeType, 'Content-Length': String(size), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`, 'Cache-Control': 'private, max-age=3600' });
    return new StreamableFile(stream);
  }

  @Post(':id/files')
  @RequirePermission('satisfaction.survey.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: MAX_FILE_BYTES } }))
  addFiles(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.service.addFiles(id, files);
  }

  @Patch(':id')
  @RequirePermission('satisfaction.survey.update')
  update(@Param('id') id: string, @Body() dto: PatchDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/confirm')
  @RequirePermission('satisfaction.survey.update')
  confirm(@Param('id') id: string) {
    return this.service.confirm(id);
  }

  @Post(':id/unconfirm')
  @RequirePermission('satisfaction.survey.update')
  unconfirm(@Param('id') id: string) {
    return this.service.unconfirm(id);
  }

  @Post(':id/extract')
  @RequirePermission('satisfaction.survey.update')
  extract(@Param('id') id: string) {
    return this.service.reextract(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('satisfaction.survey.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
