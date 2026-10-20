import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareGrowthService } from './care-growth.service';

class GrowthRecordDto {
  @ApiProperty() @IsString() @IsNotEmpty() babyProfileId: string;
  @ApiProperty({ description: '测量日期 YYYY-MM-DD' }) @IsString() @IsNotEmpty() measuredAt: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() weightG?: number | null;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lengthCm?: number | null;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() headCm?: number | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() note?: string | null;
}

@ApiTags('care/growth')
@Controller('care/growth')
export class CareGrowthController {
  constructor(private readonly service: CareGrowthService) {}

  /** 宝宝的生长曲线数据：测量点 + 国家标准曲线 + 最新评价 */
  @Get('baby/:babyId')
  @RequirePermission('care.profile.view')
  report(@Param('babyId') babyId: string, @Query('standard') standard?: string) {
    return this.service.report(babyId, standard);
  }

  @Post('records')
  @RequirePermission('care.profile.update')
  addRecord(@Body() dto: GrowthRecordDto) {
    return this.service.addRecord(dto);
  }

  @Delete('records/:id')
  @HttpCode(204)
  @RequirePermission('care.profile.update')
  removeRecord(@Param('id') id: string) {
    return this.service.removeRecord(id);
  }

  /** 生成发给客户的链接（旧链接作废） */
  @Post('baby/:babyId/share')
  @RequirePermission('care.profile.update')
  share(@Param('babyId') babyId: string) {
    return this.service.createShare(babyId);
  }

  @Post('baby/:babyId/share/revoke')
  @RequirePermission('care.profile.update')
  revoke(@Param('babyId') babyId: string) {
    return this.service.revokeShares(babyId);
  }
}

/** 客户打开生长曲线链接用，不需要登录 */
@ApiTags('public/growth')
@Public()
@Controller('public/growth')
export class PublicGrowthController {
  constructor(private readonly service: CareGrowthService) {}

  @Get(':token')
  report(@Param('token') token: string, @Query('standard') standard?: string) {
    return this.service.publicReport(token, standard);
  }
}
