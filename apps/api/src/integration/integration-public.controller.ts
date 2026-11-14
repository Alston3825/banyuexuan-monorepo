import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard, IntegrationCaller } from './api-key.guard';
import { IntegrationPublicService } from './integration-public.service';

/** 对外集成接口（外部系统用 API Key）。只读主数据 + 写回呼叫事件，详见 docs/集成规范-呼叫定位系统.md */
@ApiTags('integration/v1')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('integration/v1')
export class IntegrationPublicController {
  constructor(private readonly svc: IntegrationPublicService) {}

  @Get('ping')
  ping(@Req() req: { integration: IntegrationCaller }) {
    return { ok: true, system: req.integration.code, serverTime: new Date().toISOString() };
  }

  @Get('stores')
  stores(@Req() req: { integration: IntegrationCaller }, @Query('updatedSince') since?: string) {
    return this.svc.stores(req.integration, since);
  }

  @Get('rooms')
  rooms(@Req() req: { integration: IntegrationCaller }, @Query('storeId') storeId?: string, @Query('updatedSince') since?: string) {
    return this.svc.rooms(req.integration, storeId, since);
  }

  @Get('staff')
  staff(@Req() req: { integration: IntegrationCaller }, @Query('storeId') storeId?: string, @Query('updatedSince') since?: string) {
    return this.svc.staff(req.integration, storeId, since);
  }

  @Get('stays')
  stays(@Req() req: { integration: IntegrationCaller }, @Query('storeId') storeId?: string, @Query('updatedSince') since?: string, @Query('status') status?: string) {
    return this.svc.stays(req.integration, storeId, since, status);
  }

  @Get('service-codes')
  serviceCodes(@Req() req: { integration: IntegrationCaller }) {
    return this.svc.serviceCodes(req.integration);
  }

  @Get('events')
  events(@Req() req: { integration: IntegrationCaller }, @Query('storeId') storeId?: string, @Query('afterSeq') afterSeq?: string) {
    return this.svc.events(req.integration, storeId, afterSeq);
  }

  @Post('call-events')
  @HttpCode(200)
  callEvents(@Req() req: { integration: IntegrationCaller }, @Body() body: Record<string, any>) {
    return this.svc.ingestCall(req.integration, body);
  }

  @Post('auth/verify')
  @HttpCode(200)
  verify(@Req() req: { integration: IntegrationCaller }, @Body() body: { username: string; password: string }) {
    return this.svc.verifyAuth(req.integration, body.username, body.password);
  }
}
