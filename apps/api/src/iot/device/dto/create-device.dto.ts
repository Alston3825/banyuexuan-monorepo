import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty() @IsString() @IsNotEmpty() storeId: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceTypeId: string;
  @ApiProperty() @IsString() @IsNotEmpty() code: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ required: false, description: '呼叫器/门禁等绑定具体房间；能耗计量总表等可不绑定' })
  @IsOptional()
  @IsString()
  roomId?: string;
}
