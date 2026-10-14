import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { InventoryItemModule } from '../inventory-item/inventory-item.module';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';

@Module({
  imports: [WorkflowEngineModule, InventoryItemModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
