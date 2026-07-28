import { ApiProperty } from '@nestjs/swagger';
import { CareAbnormalityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryCareAbnormalityDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string;
  @ApiProperty({ required: false, enum: CareAbnormalityStatus })
  @IsOptional()
  @IsEnum(CareAbnormalityStatus)
  status?: CareAbnormalityStatus;
}
