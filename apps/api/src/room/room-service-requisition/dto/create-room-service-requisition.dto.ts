import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateRoomServiceRequisitionDto {
  @ApiProperty() @IsString() occupancyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() itemName: string;
  @ApiProperty({ required: false, default: 1 }) @IsOptional() @IsInt() @Min(1) quantity?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
