import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** 管理系统事件类型（外部系统按 {store_id}/mgmt/{event_type} 订阅，或拉取 /integration/v1/events） */
export type MgmtEventType =
  | 'stay.reserved'
  | 'stay.checked_in'
  | 'stay.checked_out'
  | 'stay.room_changed'
  | 'staff.duty_changed';

/** 发件箱：业务动作成功后写一条事件；写失败只记日志，绝不影响主流程。 */
@Injectable()
export class IntegrationEventsService {
  private readonly logger = new Logger(IntegrationEventsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async emit(tenantId: string, storeId: string, eventType: MgmtEventType, entityId: string | null, payload: Record<string, unknown>) {
    try {
      await this.prisma.integrationEvent.create({
        data: { tenantId, storeId, eventType, entityId, payload: payload as Prisma.InputJsonValue },
      });
    } catch (e) {
      this.logger.warn(`写入集成事件失败 ${eventType}: ${(e as Error).message}`);
    }
  }
}
