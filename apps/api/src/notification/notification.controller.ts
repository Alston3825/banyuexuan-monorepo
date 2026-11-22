import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestContextService } from '../common/context/request-context.service';
import {
  NOTIFICATION_CATEGORIES,
  NotificationService,
} from './notification.service';

/** 消息中心：只看/改自己的消息，登录即可，不需要额外权限点。 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly ctx: RequestContextService,
  ) {}

  @Get('categories')
  categories() {
    return Object.entries(NOTIFICATION_CATEGORIES).map(([value, label]) => ({
      value,
      label,
    }));
  }

  @Get('summary')
  summary(@Query('since') since?: string) {
    return this.service.summary(this.ctx.accountId!, since);
  }

  @Get()
  list(
    @Query('unread') unread?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(this.ctx.accountId!, {
      unread: unread === '1' || unread === 'true',
      category,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }

  @Post('read-all')
  readAll(@Body() b: { category?: string }) {
    return this.service.markAllRead(this.ctx.accountId!, b?.category);
  }

  @Post(':id/read')
  read(@Param('id') id: string) {
    return this.service.markRead(this.ctx.accountId!, id);
  }
}
