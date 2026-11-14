import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { InventoryItemModule } from '../inventory-item/inventory-item.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { PurchaseRequestController } from './purchase-request.controller';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseRequestImportService } from './purchase-request-import.service';

@Module({
  imports: [WorkflowEngineModule, InventoryItemModule, PurchaseOrderModule],
  controllers: [PurchaseRequestController],
  providers: [PurchaseRequestService, PurchaseRequestImportService],
})
export class PurchaseRequestModule {}
