import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
