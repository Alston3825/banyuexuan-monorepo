import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { InventoryItemModule } from '../inventory-item/inventory-item.module';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderLogisticsService } from './purchase-order-logistics.service';
import { PurchaseOrderLogisticsCore } from './purchase-order-logistics.core';
import { PurchaseOrder1688ImportService } from './purchase-order-1688-import.service';
import { Kuaidi100Client } from './kuaidi100.client';

@Module({
  imports: [WorkflowEngineModule, InventoryItemModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService, PurchaseOrderLogisticsService, PurchaseOrderLogisticsCore, PurchaseOrder1688ImportService, Kuaidi100Client],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
