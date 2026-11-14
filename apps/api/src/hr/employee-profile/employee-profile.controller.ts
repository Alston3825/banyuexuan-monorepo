import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { EmployeeProfileService } from './employee-profile.service';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { QueryEmployeeProfileDto } from './dto/query-employee-profile.dto';

class ArchiveEmployeeDto {
  @IsOptional() @IsDateString() terminationDate?: string;
  @IsOptional() @IsString() @MaxLength(191) reason?: string;
  @IsInt() version: number;
}
class RestoreEmployeeDto {
  @IsOptional() @IsString() @MaxLength(50) employeeNo?: string;
  @IsInt() version: number;
}

@ApiTags('hr/employee-profile')
@Controller('hr/employee-profiles')
export class EmployeeProfileController {
  constructor(private readonly employeeProfileService: EmployeeProfileService) {}

  @Get()
  @RequirePermission('hr.employee-profile.view')
  findAll(@Query() query: QueryEmployeeProfileDto) {
    return this.employeeProfileService.findMany(query);
  }

  /** 下一个可用工号（新建账号时预填） */
  @Get('next-no')
  @RequirePermission('hr.employee-profile.view')
  nextNo(@Query('storeId') storeId?: string) {
    return this.employeeProfileService.nextNo(storeId || undefined);
  }

  @Get('expiry-alerts')
  @RequirePermission('hr.employee-profile.view')
  expiryAlerts(@Query('withinDays') withinDays?: string) {
    return this.employeeProfileService.expiryAlerts(withinDays ? Number(withinDays) : undefined);
  }

  @Get(':id')
  @RequirePermission('hr.employee-profile.view')
  findOne(@Param('id') id: string) {
    return this.employeeProfileService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('hr.employee-profile.create')
  create(@Body() dto: CreateEmployeeProfileDto) {
    return this.employeeProfileService.create(dto);
  }

  /** 离职归档：档案只读、账号停用、工号释放 */
  @Post(':id/archive')
  @RequirePermission('hr.employee-profile.archive')
  archive(@Param('id') id: string, @Body() dto: ArchiveEmployeeDto) {
    return this.employeeProfileService.archive(id, dto);
  }

  /** 恢复在职（默认仅管理员） */
  @Post(':id/restore')
  @RequirePermission('hr.employee-profile.restore')
  restore(@Param('id') id: string, @Body() dto: RestoreEmployeeDto) {
    return this.employeeProfileService.restore(id, dto);
  }

  @Patch(':id')
  @RequirePermission('hr.employee-profile.update')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeProfileDto) {
    return this.employeeProfileService.update(id, dto);
  }
}
