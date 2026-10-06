import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CustomerChannelService, CustomerChannelTypeService } from './customer-channel.service';
import {
  CreateChannelTypeDto,
  CreateCustomerChannelDto,
  QueryCustomerChannelDto,
  UpdateChannelTypeDto,
  UpdateCustomerChannelDto,
} from './dto/customer-channel.dto';

@ApiTags('crm/customer-channel')
@Controller('crm')
export class CustomerChannelController {
  constructor(
    private readonly channelService: CustomerChannelService,
    private readonly typeService: CustomerChannelTypeService,
  ) {}

  // ---------------- 渠道类型 ----------------

  @Get('customer-channel-types')
  @RequirePermission('crm.channel.view')
  findTypes() {
    return this.typeService.list();
  }

  @Post('customer-channel-types')
  @RequirePermission('crm.channel.create')
  createType(@Body() dto: CreateChannelTypeDto) {
    return this.typeService.createType(dto);
  }

  @Patch('customer-channel-types/:id')
  @RequirePermission('crm.channel.update')
  updateType(@Param('id') id: string, @Body() dto: UpdateChannelTypeDto) {
    return this.typeService.updateType(id, dto);
  }

  @Delete('customer-channel-types/:id')
  @HttpCode(204)
  @RequirePermission('crm.channel.update')
  removeType(@Param('id') id: string) {
    return this.typeService.removeType(id);
  }

  // ---------------- 具体渠道 ----------------

  @Get('customer-channels')
  @RequirePermission('crm.channel.view')
  findAll(@Query() query: QueryCustomerChannelDto) {
    return this.channelService.list(query);
  }

  @Post('customer-channels')
  @RequirePermission('crm.channel.create')
  create(@Body() dto: CreateCustomerChannelDto) {
    return this.channelService.createChannel(dto);
  }

  @Patch('customer-channels/:id')
  @RequirePermission('crm.channel.update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerChannelDto) {
    return this.channelService.updateChannel(id, dto);
  }

  @Delete('customer-channels/:id')
  @HttpCode(204)
  @RequirePermission('crm.channel.update')
  remove(@Param('id') id: string) {
    return this.channelService.removeChannel(id);
  }
}
