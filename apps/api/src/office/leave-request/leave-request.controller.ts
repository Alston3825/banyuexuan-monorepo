import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { LeaveRequestService } from './leave-request.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('office/leave-request')
@Controller('office/leave-requests')
export class LeaveRequestController {
  constructor(private readonly leaveRequestService: LeaveRequestService) {}

  @Get()
  @RequirePermission('office.leave-request.view')
  findAll(@Query() query: QueryLeaveRequestDto) {
    return this.leaveRequestService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('office.leave-request.view')
  findOne(@Param('id') id: string) {
    return this.leaveRequestService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('office.leave-request.create')
  create(@Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequestService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('office.leave-request.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.leaveRequestService.submit(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('office.leave-request.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelLeaveRequestDto) {
    return this.leaveRequestService.cancel(id, dto.cancelReason, dto.version);
  }
}
