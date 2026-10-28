import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { InventoryItemModule } from '../inventory-item/inventory-item.module';
import { GoodsReceiptController } from './goods-receipt.controller';
import { GoodsReceiptService } from './goods-receipt.service';

@Module({
  imports: [WorkflowEngineModule, InventoryItemModule],
  controllers: [GoodsReceiptController],
  providers: [GoodsReceiptService],
  exports: [GoodsReceiptService],
})
export class GoodsReceiptModule {}
