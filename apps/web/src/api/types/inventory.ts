import type { CommonStatus, ScopedEntityBase } from './common'

export type WarehousePurpose = 'OPERATING' | 'LOGISTICS'
export type InventoryDocStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'
export type StockIssueType = 'ISSUE' | 'REQUISITION' | 'LOSS'

export interface Supplier extends ScopedEntityBase {
  code: string
  name: string
  contactName: string | null
  phone: string | null
  remark: string | null
  status: CommonStatus
}
export interface CreateSupplierDto {
  code: string
  name: string
  contactName?: string
  phone?: string
  remark?: string
}
export interface UpdateSupplierDto {
  name?: string
  contactName?: string
  phone?: string
  remark?: string
  status?: CommonStatus
  version: number
}

export interface Warehouse extends ScopedEntityBase {
  storeId: string
  code: string
  name: string
  purpose: WarehousePurpose
  requiresApproval: boolean
  status: CommonStatus
}
export interface CreateWarehouseDto {
  storeId: string
  code: string
  name: string
  purpose?: WarehousePurpose
  requiresApproval?: boolean
}
export interface UpdateWarehouseDto {
  name?: string
  requiresApproval?: boolean
  status?: CommonStatus
  version: number
}

export interface InventoryItem extends ScopedEntityBase {
  code: string
  name: string
  unit: string
  category: string | null
  purpose: WarehousePurpose
  safetyStockThreshold: number | null
  shelfLifeDays: number | null
  status: CommonStatus
}
export interface CreateInventoryItemDto {
  code: string
  name: string
  unit: string
  category?: string
  purpose?: WarehousePurpose
  safetyStockThreshold?: number
  shelfLifeDays?: number
}
export interface UpdateInventoryItemDto {
  name?: string
  category?: string
  safetyStockThreshold?: number
  shelfLifeDays?: number
  status?: CommonStatus
  version: number
}

export interface WarehouseStock {
  id: string
  warehouseId: string
  itemId: string
  quantity: number
  avgCost: number
  updatedAt: string
  warehouse: Warehouse
  item: InventoryItem
}

export interface StockBatch {
  id: string
  tenantId: string
  warehouseId: string
  itemId: string
  batchNo: string
  quantity: number
  unitCost: number
  receivedAt: string
  expiresAt: string | null
  sourceType: string
  sourceId: string
  createdAt: string
  warehouse: Warehouse
  item: InventoryItem
}
export interface StockBatchExpiryAlert extends StockBatch {
  isExpired: boolean
}

// ---------------- 采购单 ----------------
export interface PurchaseOrderItemInput {
  itemId: string
  quantity: number
  unitPrice: number
}
export interface PurchaseOrderItem {
  id: string
  purchaseOrderId: string
  itemId: string
  quantity: number
  unitPrice: number
  subtotal: number
  item: InventoryItem
}
export interface PurchaseOrder {
  id: string
  tenantId: string
  storeId: string
  warehouseId: string
  supplierId: string
  orderNo: string
  status: InventoryDocStatus
  totalAmount: number
  remark: string | null
  cancelReason: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  supplier: Supplier
  warehouse: Warehouse
  items: PurchaseOrderItem[]
}
export interface CreatePurchaseOrderDto {
  storeId: string
  warehouseId: string
  supplierId: string
  remark?: string
  items: PurchaseOrderItemInput[]
}

// ---------------- 入库单 ----------------
export interface GoodsReceiptItemInput {
  itemId: string
  quantity: number
  unitCost: number
}
export interface GoodsReceiptItem {
  id: string
  goodsReceiptId: string
  itemId: string
  quantity: number
  unitCost: number
  item: InventoryItem
}
export interface GoodsReceipt {
  id: string
  tenantId: string
  storeId: string
  warehouseId: string
  purchaseOrderId: string | null
  receiptNo: string
  status: InventoryDocStatus
  remark: string | null
  cancelReason: string | null
  completedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  warehouse: Warehouse
  purchaseOrder: PurchaseOrder | null
  items: GoodsReceiptItem[]
}
export interface CreateGoodsReceiptDto {
  storeId: string
  warehouseId: string
  purchaseOrderId?: string
  remark?: string
  items: GoodsReceiptItemInput[]
}

// ---------------- 出库/领用单 ----------------
export interface StockIssueItemInput {
  itemId: string
  quantity: number
}
export interface StockIssueItem {
  id: string
  stockIssueId: string
  itemId: string
  quantity: number
  unitCost: number | null
  item: InventoryItem
}
export interface StockIssue {
  id: string
  tenantId: string
  storeId: string
  warehouseId: string
  issueNo: string
  issueType: StockIssueType
  status: InventoryDocStatus
  remark: string | null
  cancelReason: string | null
  completedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  warehouse: Warehouse
  items: StockIssueItem[]
}
export interface CreateStockIssueDto {
  storeId: string
  warehouseId: string
  issueType?: StockIssueType
  remark?: string
  items: StockIssueItemInput[]
}

// ---------------- 调拨单 ----------------
export interface StockTransferItemInput {
  itemId: string
  quantity: number
}
export interface StockTransferItem {
  id: string
  stockTransferId: string
  itemId: string
  quantity: number
  item: InventoryItem
}
export interface StockTransfer {
  id: string
  tenantId: string
  fromWarehouseId: string
  toWarehouseId: string
  transferNo: string
  status: InventoryDocStatus
  remark: string | null
  cancelReason: string | null
  completedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  fromWarehouse: Warehouse
  toWarehouse: Warehouse
  items: StockTransferItem[]
}
export interface CreateStockTransferDto {
  fromWarehouseId: string
  toWarehouseId: string
  remark?: string
  items: StockTransferItemInput[]
}

// ---------------- 盘点单 ----------------
export interface StockCountItemInput {
  itemId: string
  countedQuantity: number
}
export interface StockCountItem {
  id: string
  stockCountId: string
  itemId: string
  systemQuantity: number
  countedQuantity: number
  diffQuantity: number
  item: InventoryItem
}
export interface StockCount {
  id: string
  tenantId: string
  storeId: string
  warehouseId: string
  countNo: string
  status: InventoryDocStatus
  remark: string | null
  cancelReason: string | null
  completedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  warehouse: Warehouse
  items: StockCountItem[]
}
export interface CreateStockCountDto {
  storeId: string
  warehouseId: string
  remark?: string
  items: StockCountItemInput[]
}
