import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationSchedulerService } from './notification-scheduler.service';

/** 全局模块：任何业务模块都能直接注入 NotificationService 发站内消息。 */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSchedulerService],
  exports: [NotificationService, NotificationSchedulerService],
})
export class NotificationModule {}
