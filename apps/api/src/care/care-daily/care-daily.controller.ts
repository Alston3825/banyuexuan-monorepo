import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareDailyService } from './care-daily.service';

class SaveDayBody {
  @ApiProperty() @IsString() @IsNotEmpty() motherProfileId: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsString() @IsNotEmpty() date: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() documentId?: string | null;
  @ApiProperty({ required: false, description: '当天记录已存在时必填（乐观锁）' }) @IsOptional() @IsInt() version?: number;
  @ApiProperty({ description: '妈妈栏字段值' }) @IsObject() mother: Record<string, unknown>;
  @ApiProperty({ description: '每个宝宝的栏：babyProfileId + values + feedings[]' }) @IsArray() babies: { babyProfileId: string; values: Record<string, unknown>; feedings?: Record<string, unknown>[]; nursings?: Record<string, unknown>[] }[];
}

@ApiTags('care/daily')
@Controller('care/daily')
export class CareDailyController {
  constructor(private readonly service: CareDailyService) {}

  @Get('specs')
  @RequirePermission('care.profile.view')
  specs() {
    return this.service.specs();
  }

  /** 从入住日到今天每天一行，标出已填/未填。 */
  @Get('days')
  @RequirePermission('care.profile.view')
  days(@Query('motherProfileId') motherProfileId: string) {
    return this.service.days(motherProfileId);
  }

  @Get('pending')
  @RequirePermission('care.profile.view')
  pending(@Query('storeId') storeId?: string, @Query('date') date?: string) {
    return this.service.pending(storeId, date);
  }

  @Get('day')
  @RequirePermission('care.profile.view')
  day(@Query('motherProfileId') motherProfileId: string, @Query('date') date: string) {
    return this.service.day(motherProfileId, date);
  }

  /** 整天保存（没有就创建，有就更新）：妈妈栏 + 各宝宝栏 + 喂养行。 */
  @Put('day')
  @RequirePermission('care.profile.update')
  save(@Body() dto: SaveDayBody) {
    return this.service.saveDay(dto);
  }
}
