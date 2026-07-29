import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { PlatformModule } from './platform/platform.module';
import { WorkflowModule } from './workflow/workflow.module';
import { CrmModule } from './crm/crm.module';
import { ContractModule } from './contract/contract.module';
import { RoomModule } from './room/room.module';
import { PaymentModule } from './payment/payment.module';
import { CareModule } from './care/care.module';
import { MealModule } from './meal/meal.module';
import { ServiceModule } from './service/service.module';
import { InventoryModule } from './inventory/inventory.module';
import { HrModule } from './hr/hr.module';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { FieldMaskInterceptor } from './common/interceptors/field-mask.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    CommonModule,
    QueueModule,
    AuthModule,
    PlatformModule,
    WorkflowModule,
    CrmModule,
    ContractModule,
    RoomModule,
    PaymentModule,
    CareModule,
    MealModule,
    ServiceModule,
    InventoryModule,
    HrModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: FieldMaskInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
