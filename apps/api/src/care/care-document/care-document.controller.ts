import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiProperty, ApiTags } from '@nestjs/swagger';
import { CareDocType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareDocumentService } from './care-document.service';

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 手机拍的照片一般 2-5MB，PDF 扫描件可能十几 MB
const MAX_FILES = 20;

class UploadCareDocumentDto {
  @ApiProperty({ enum: CareDocType }) @IsEnum(CareDocType) docType: CareDocType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false, description: '宝宝类资料（新生儿入所/宝宝出所评估等）要指定哪个宝宝' }) @IsOptional() @IsString() babyProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() docDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
  @ApiProperty({ required: false, description: "传 'false' 表示只留档、不自动识别（手工录入后补传原件时用）" }) @IsOptional() @IsString() autoExtract?: string;
}

class QueryCareDocumentDto {
  @IsOptional() @IsString() motherProfileId?: string;
  @IsOptional() @IsString() babyProfileId?: string;
  @IsOptional() @IsEnum(CareDocType) docType?: CareDocType;
}

class UpdateCareDocumentDto {
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsDateString() docDate?: string | null;
  @IsOptional() @IsString() remark?: string | null;
}

@ApiTags('care/document')
@Controller('care/documents')
export class CareDocumentController {
  constructor(private readonly service: CareDocumentService) {}

  @Get()
  @RequirePermission('care.profile.view')
  list(@Query() query: QueryCareDocumentDto) {
    return this.service.list(query);
  }

  /** 上传一份纸质资料（同一份的多张照片一起传）。结构化类型上传后自动在后台识别。 */
  @Post()
  @RequirePermission('care.profile.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(@UploadedFiles() files: Express.Multer.File[], @Body() dto: UploadCareDocumentDto) {
    return this.service.upload(files, dto);
  }

  @Get(':id')
  @RequirePermission('care.profile.view')
  findOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Get(':id/files/:fileId')
  @RequirePermission('care.profile.view')
  async file(@Param('id') id: string, @Param('fileId') fileId: string, @Res({ passthrough: true }) res: Response) {
    const { stream, size, mimeType, fileName } = await this.service.openFile(id, fileId);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(stream);
  }

  @Post(':id/files')
  @RequirePermission('care.profile.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES } }))
  addFiles(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.service.addFiles(id, files);
  }

  @Patch(':id')
  @RequirePermission('care.profile.update')
  update(@Param('id') id: string, @Body() dto: UpdateCareDocumentDto) {
    return this.service.updateMeta(id, dto);
  }

  @Post(':id/extract')
  @RequirePermission('care.profile.update')
  extract(@Param('id') id: string) {
    return this.service.reextract(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('care.profile.update')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
