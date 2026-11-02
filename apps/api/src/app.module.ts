import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { PlatformModule } from './platform/platform.module';
import { WorkflowModule } from './workflow/workflow.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { CrmModule } from './crm/crm.module';
import { ContractModule } from './contract/contract.module';
import { RoomModule } from './room/room.module';
import { PaymentModule } from './payment/payment.module';
import { SatisfactionModule } from './satisfaction/satisfaction.module';
import { CareModule } from './care/care.module';
import { MealModule } from './meal/meal.module';
import { ServiceModule } from './service/service.module';
import { InventoryModule } from './inventory/inventory.module';
import { HrModule } from './hr/hr.module';
import { FinanceModule } from './finance/finance.module';
import { OfficeModule } from './office/office.module';
import { LogisticsModule } from './logistics/logistics.module';
import { AiModule } from './ai/ai.module';
import { IotModule } from './iot/iot.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TrainingModule } from './training/training.module';
import { RecycleBinModule } from './common/recycle/recycle-bin.module';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { FieldMaskInterceptor } from './common/interceptors/field-mask.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // 全局接口限流：按IP每分钟120次，日常UI操作（含并发多接口的看板页面）不会触发，
    // 但能拦住暴力破解/爬取类的异常高频请求。单个接口需要更严格的限制时可用 @Throttle() 覆盖。
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CommonModule,
    QueueModule,
    AuthModule,
    PlatformModule,
    WorkflowModule,
    WorkspaceModule,
    CrmModule,
    RecycleBinModule,
    ContractModule,
    RoomModule,
    PaymentModule,
    CareModule,
    SatisfactionModule,
    MealModule,
    ServiceModule,
    InventoryModule,
    HrModule,
    FinanceModule,
    OfficeModule,
    LogisticsModule,
    AiModule,
    IotModule,
    AnalyticsModule,
    TrainingModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: FieldMaskInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
