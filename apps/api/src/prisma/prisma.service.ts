import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * 开机/容器重启这类场景下，Nest 应用经常比 MySQL 容器先起来——原来这里 $connect() 失败
   * 直接抛出会让 onModuleInit 崩掉整个 Nest 启动流程。用 `nest start --watch` 跑的时候，
   * 内层这个 Node 进程崩了，外层 watch 进程本身没崩、也不会因为"运行时崩溃"去重新拉起
   * 内层进程（它只在源码文件变化时重新编译/重启），进程管理器（pm2等）看到的是外层进程
   * 仍然"活着"，于是既不重启、也再没有任何东西真正监听端口——表现成"看着在线，实际连不上"，
   * 比进程管理器本身的 autorestart 更难排查。这里改成失败后重试而不是直接抛出，给数据库
   * 一点起来的时间；重试次数封顶后仍失败才真正抛出（避免配置真的错了时永远卡住不报错）。
   */
  async onModuleInit() {
    const maxAttempts = 30;
    const retryDelayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Prisma connected');
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        this.logger.warn(`数据库连接失败（第 ${attempt}/${maxAttempts} 次），${retryDelayMs}ms 后重试：${(err as Error).message}`);
        await sleep(retryDelayMs);
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
