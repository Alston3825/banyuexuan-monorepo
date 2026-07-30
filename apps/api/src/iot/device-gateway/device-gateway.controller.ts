import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DeviceGatewayService } from './device-gateway.service';
import { ReportDeviceEventDto } from './dto/report-device-event.dto';
import { IssueDeviceCommandDto } from './dto/issue-device-command.dto';

@ApiTags('iot/device-gateway')
@Controller('iot/gateway')
export class DeviceGatewayController {
  constructor(private readonly deviceGatewayService: DeviceGatewayService) {}

  @Get('events')
  @RequirePermission('iot.device-event.view')
  findEvents(@Query('deviceId') deviceId?: string, @Query('storeId') storeId?: string) {
    return this.deviceGatewayService.findEvents({ deviceId, storeId });
  }

  @Post('events')
  @RequirePermission('iot.device-event.simulate')
  reportEvent(@Body() dto: ReportDeviceEventDto) {
    return this.deviceGatewayService.reportEvent(dto);
  }

  @Get('devices/:deviceId/shadow')
  @RequirePermission('iot.device-event.view')
  getShadow(@Param('deviceId') deviceId: string) {
    return this.deviceGatewayService.getShadow(deviceId);
  }

  @Post('devices/:deviceId/commands')
  @RequirePermission('iot.device-event.issue-command')
  issueCommand(@Param('deviceId') deviceId: string, @Body() dto: IssueDeviceCommandDto) {
    return this.deviceGatewayService.issueCommand(deviceId, dto.desiredState);
  }

  @Post('devices/:deviceId/commands/confirm')
  @RequirePermission('iot.device-event.confirm-command')
  confirmCommand(@Param('deviceId') deviceId: string) {
    return this.deviceGatewayService.confirmCommand(deviceId);
  }
}
