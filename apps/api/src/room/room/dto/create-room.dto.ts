import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() roomTypeId: string;
  @ApiProperty() @IsString() roomNo: string;
  @ApiProperty({ description: '楼层标签，如 "1F"/"B1"' }) @IsString() floor: string;
}
