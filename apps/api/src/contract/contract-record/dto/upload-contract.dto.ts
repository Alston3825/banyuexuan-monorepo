import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** multipart 表单里除文件外的字段（文件字段名固定为 files，可传多个：一份合同的多张照片或一个 PDF）。 */
export class UploadContractDto {
  @ApiProperty({ required: false, description: '门店；不传则用当前账号所属门店' })
  @IsOptional()
  @IsString()
  storeId?: string;
}

export class CreateManualContractDto {
  @ApiProperty({ required: false, description: '门店；不传则用当前账号所属门店' })
  @IsOptional()
  @IsString()
  storeId?: string;
}
