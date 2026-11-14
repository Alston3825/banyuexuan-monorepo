import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareMedicationService } from './care-medication.service';

class MedicationBody {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string;
  @ApiProperty({ required: false, description: '变更：基于哪一份委托书新签' }) @IsOptional() @IsString() previousAuthId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() changeNote?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() documentId?: string | null;
  @ApiProperty({ required: false, description: '修改时的乐观锁版本号' }) @IsOptional() @IsInt() version?: number;
  @ApiProperty() @IsObject() header: Record<string, unknown>;
  @ApiProperty() @IsArray() items: Record<string, unknown>[];
}

class StopBody {
  @ApiProperty() @IsInt() version: number;
  @ApiProperty() @IsString() @IsNotEmpty() note: string;
}

@ApiTags('care/medication')
@Controller('care/medications')
export class CareMedicationController {
  constructor(private readonly service: CareMedicationService) {}

  @Get('specs')
  @RequirePermission('care.profile.view')
  specs() {
    return this.service.specs();
  }

  @Get()
  @RequirePermission('care.profile.view')
  list(@Query('motherProfileId') motherProfileId?: string, @Query('babyProfileId') babyProfileId?: string) {
    return this.service.list({ motherProfileId, babyProfileId });
  }

  /** 新签一份委托书；带 previousAuthId 表示变更（上一份自动变成已替换）。 */
  @Post()
  @RequirePermission('care.profile.create')
  create(@Body() dto: MedicationBody) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.profile.update')
  update(@Param('id') id: string, @Body() dto: MedicationBody) {
    return this.service.update(id, dto);
  }

  @Post(':id/stop')
  @RequirePermission('care.profile.update')
  stop(@Param('id') id: string, @Body() dto: StopBody) {
    return this.service.stop(id, dto);
  }
}
