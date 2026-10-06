import { Module } from '@nestjs/common';
import { SupplierModule } from './supplier/supplier.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { InventoryItemModule } from './inventory-item/inventory-item.module';
import { WarehouseStockModule } from './warehouse-stock/warehouse-stock.module';
import { StockBatchModule } from './stock-batch/stock-batch.module';
import { PurchaseOrderModule } from './purchase-order/purchase-order.module';
import { PurchaseRequestModule } from './purchase-request/purchase-request.module';
import { GoodsReceiptModule } from './goods-receipt/goods-receipt.module';
import { StockIssueModule } from './stock-issue/stock-issue.module';
import { StockTransferModule } from './stock-transfer/stock-transfer.module';
import { StockCountModule } from './stock-count/stock-count.module';

@Module({
  imports: [
    SupplierModule,
    WarehouseModule,
    InventoryItemModule,
    WarehouseStockModule,
    StockBatchModule,
    PurchaseOrderModule,
    PurchaseRequestModule,
    GoodsReceiptModule,
    StockIssueModule,
    StockTransferModule,
    StockCountModule,
  ],
})
export class InventoryModule {}
