import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WORKFLOW_ARCHIVE_QUEUE } from './queue.constants';

/**
 * 全局队列基础设施：只负责 BullMQ 与 Redis 的连接配置 + 注册队列名，
 * 不放具体业务 processor（那些跟着对应业务模块走，见 workflow-engine 模块），
 * 避免"队列模块依赖业务模块、业务模块又依赖队列模块"的循环依赖。
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const url = new URL(configService.get<string>('REDIS_URL')!);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: url.password || undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: WORKFLOW_ARCHIVE_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
