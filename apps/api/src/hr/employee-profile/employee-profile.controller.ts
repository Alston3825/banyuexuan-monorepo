import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { EmployeeProfileService } from './employee-profile.service';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { QueryEmployeeProfileDto } from './dto/query-employee-profile.dto';

@ApiTags('hr/employee-profile')
@Controller('hr/employee-profiles')
export class EmployeeProfileController {
  constructor(private readonly employeeProfileService: EmployeeProfileService) {}

  @Get()
  @RequirePermission('hr.employee-profile.view')
  findAll(@Query() query: QueryEmployeeProfileDto) {
    return this.employeeProfileService.findMany(query);
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

  @Patch(':id')
  @RequirePermission('hr.employee-profile.update')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeProfileDto) {
    return this.employeeProfileService.update(id, dto);
  }
}
