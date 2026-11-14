import { Module } from '@nestjs/common';
import { InventoryItemController } from './inventory-item.controller';
import { InventoryItemService } from './inventory-item.service';
import { InventoryItemImportService } from './inventory-item-import.service';

@Module({
  controllers: [InventoryItemController],
  providers: [InventoryItemService, InventoryItemImportService],
  exports: [InventoryItemService, InventoryItemImportService],
})
export class InventoryItemModule {}
