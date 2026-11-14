import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ContractRecordService } from './contract-record.service';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ConfirmContractDto } from './dto/confirm-contract.dto';
import { VoidContractDto } from './dto/void-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';
import { CreateManualContractDto, UploadContractDto } from './dto/upload-contract.dto';

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 单个文件 30MB（手机拍的合同照片一般 2-5MB，扫描 PDF 十几 MB）
const MAX_FILES = 30;

@ApiTags('contract/record')
@Controller('contract/records')
export class ContractRecordController {
  constructor(private readonly contractRecordService: ContractRecordService) {}

  @Get()
  @RequirePermission('contract.record.view')
  findAll(@Query() query: QueryContractDto) {
    return this.contractRecordService.findMany(query);
  }

  /** 上传纸质合同（一个 PDF，或同一份合同的多张照片），AI 在后台识别，识别进度看 extractStatus。 */
  @Post('upload')
  @RequirePermission('contract.record.upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(@UploadedFiles() files: Express.Multer.File[], @Body() dto: UploadContractDto) {
    return this.contractRecordService.createFromUpload(files, dto.storeId);
  }

  @Post('manual')
  @RequirePermission('contract.record.upload')
  createManual(@Body() dto: CreateManualContractDto) {
    return this.contractRecordService.createManual(dto.storeId);
  }

  @Get(':id')
  @RequirePermission('contract.record.view')
  findOne(@Param('id') id: string) {
    return this.contractRecordService.getDetail(id);
  }

  @Get(':id/customer-matches')
  @RequirePermission('contract.record.view')
  customerMatches(@Param('id') id: string) {
    return this.contractRecordService.customerMatches(id);
  }

  @Get(':id/files/:fileId')
  @RequirePermission('contract.record.view')
  async file(@Param('id') id: string, @Param('fileId') fileId: string, @Res({ passthrough: true }) res: Response) {
    const { stream, size, mimeType, fileName } = await this.contractRecordService.openFile(id, fileId);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(stream);
  }

  @Patch(':id')
  @RequirePermission('contract.record.update')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractRecordService.update(id, dto);
  }

  @Post(':id/reextract')
  @RequirePermission('contract.record.upload')
  reextract(@Param('id') id: string) {
    return this.contractRecordService.reextract(id);
  }

  @Post(':id/confirm')
  @RequirePermission('contract.record.confirm')
  confirm(@Param('id') id: string, @Body() dto: ConfirmContractDto) {
    return this.contractRecordService.confirm(id, dto);
  }

  @Post(':id/void')
  @RequirePermission('contract.record.void')
  void(@Param('id') id: string, @Body() dto: VoidContractDto) {
    return this.contractRecordService.void(id, dto.voidReason, dto.version);
  }

  @Delete(':id')
  @RequirePermission('contract.record.delete')
  async remove(@Param('id') id: string) {
    await this.contractRecordService.remove(id);
    return { success: true };
  }
}
