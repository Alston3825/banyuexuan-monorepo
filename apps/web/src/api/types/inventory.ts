import type { CommonStatus, ScopedEntityBase } from './common'

export type WarehousePurpose = 'OPERATING' | 'LOGISTICS'
export type InventoryDocStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'PURCHASED' | 'PENDING_RECEIPT' | 'PARTIALLY_RECEIVED'
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
  /** 规格/型号/尺寸 */
  spec: string | null
  brand: string | null
  /** 参考单价（接口里是字符串形式的小数） */
  referencePrice: string | number | null
  purpose: WarehousePurpose
  safetyStockThreshold: number | null
  shelfLifeDays: number | null
  status: CommonStatus
}
export interface CreateInventoryItemDto {
  /** 不填则自动生成 */
  code?: string
  name: string
  unit: string
  category?: string
  spec?: string
  brand?: string
  referencePrice?: number
  purpose?: WarehousePurpose
  safetyStockThreshold?: number
  shelfLifeDays?: number
}
export interface UpdateInventoryItemDto {
  name?: string
  /** 计量单位（只改显示的名称，库存数量不换算） */
  unit?: string
  category?: string
  /** 空字符串 = 清空 */
  spec?: string
  brand?: string
  /** null = 清空 */
  referencePrice?: number | null
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
  /** 物品库里已有的物品；新物品不传，改传 newItem */
  itemId?: string
  newItem?: { name: string; spec?: string; brand?: string; unit: string }
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
  /** 采购员确认采购的信息 */
  purchasedAt?: string | null
  purchasedById?: string | null
  expressNo?: string | null
  purchaseNote?: string | null
  platform?: string | null
  platformOrderNo?: string | null
  logisticsState?: number | null
  /** 采购单下的 1688 订单/包裹（列表里只带状态） */
  shipments?: { id: string; logisticsState: number | null; expressNo: string }[]
  supplier: Supplier
  warehouse: Warehouse
  items: PurchaseOrderItem[]
  goodsReceipts?: { id: string; receiptNo: string; status: InventoryDocStatus; tracked: boolean }[]
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
  /** 已有物品；新物品不填，改填 newItem */
  itemId?: string
  /** 物品库里还没有的新物品（保存时自动加入物品库） */
  newItem?: { name: string; spec?: string; unit: string }
  /** 用已有物品，同时把它的名称改成这个 */
  renameItemTo?: string
  quantity: number
  unitCost: number
}
export interface SimilarItem {
  id: string
  code: string
  name: string
  spec: string | null
  brand: string | null
  unit: string
  score: number
  /** 名称和规格都一样：可以直接用已有的 */
  exact: boolean
}
export interface GoodsReceiptItem {
  id: string
  goodsReceiptId: string
  itemId: string
  quantity: number
  unitCost: number
  /** 逐项收货的入库单：已到货入库的累计数量 */
  receivedQuantity: number
  item: InventoryItem
}
export interface GoodsReceiptConfirmation {
  id: string
  goodsReceiptId: string
  confirmedById: string
  confirmedByName?: string
  confirmedAt: string
  expressNo: string | null
  note: string | null
  lines: { id: string; goodsReceiptItemId: string; quantity: number; expiresAt: string | null; note: string | null }[]
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
  /** true=按快递到货逐项确认收货的入库单（由“确认采购”自动生成） */
  tracked: boolean
  shortClosedNote: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  warehouse: Warehouse
  purchaseOrder: PurchaseOrder | null
  items: GoodsReceiptItem[]
  confirmations?: GoodsReceiptConfirmation[]
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

/** Excel 导入：表里每一行整理出来的物品 */
export interface ItemImportRow {
  rowNo: number
  name: string
  spec: string | null
  brand: string | null
  unit: string | null
  referencePrice: number | null
}
export type ItemImportStatus = 'NEW' | 'EXISTS' | 'DUP_IN_FILE' | 'MISSING_UNIT'
export interface ItemImportPreviewRow extends ItemImportRow {
  status: ItemImportStatus
  message: string
  existingId: string | null
}
export interface ItemImportPreview {
  sheetName: string
  headerRow: number
  ignoredColumns: string[]
  rows: ItemImportPreviewRow[]
}
export interface ItemImportResult {
  created: number
  updated: number
  skipped: number
  skippedDetail: { rowNo: number; name: string; reason: string }[]
}

// ---------------- 申购单 ----------------
export type PurchaseRequestStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ORDERED' | 'SUBMITTED' | 'COLLECTED'
export type PurchaseRequestKind = 'SUMMARY' | 'DEPARTMENT'

export interface PurchaseRequestItem {
  id: string
  sortNo: number
  itemId: string | null
  name: string
  spec: string | null
  brand: string | null
  unit: string | null
  quantity: number
  unitPrice: string | number | null
  subtotal: string | number
  department: string | null
  requester: string | null
  purpose: string | null
  remark: string | null
}

export interface PurchaseRequest {
  id: string
  kind: PurchaseRequestKind
  departmentName: string | null
  createdBy: string
  /** 列表接口附带：提交人姓名 */
  creatorName?: string
  summaryRequestId: string | null
  summaryRequest?: { id: string; requestNo: string; status?: string } | null
  storeId: string
  requestNo: string
  requestDate: string
  status: PurchaseRequestStatus
  totalAmount: string | number
  sourceFileName: string | null
  remark: string | null
  cancelReason: string | null
  purchaseOrderId: string | null
  version: number
  createdAt: string
  store: { id: string; name: string }
  purchaseOrder: { id: string; orderNo: string; status?: string } | null
  /** 列表接口带；详情接口带 items */
  _count?: { items: number }
  items: PurchaseRequestItem[]
}

export interface RequestImportRow {
  rowNo: number
  department: string | null
  requester: string | null
  name: string
  spec: string | null
  brand: string | null
  unit: string | null
  quantity: number | null
  unitPrice: number | null
  purpose: string | null
}
export interface RequestImportPreviewRow extends RequestImportRow {
  sheetSubtotal: number | null
  itemId: string | null
  issues: string[]
}
export interface RequestImportPreview {
  sheetName: string
  headerRow: number
  titleText: string | null
  storeGuess: { id: string; name: string } | null
  requestDate: string | null
  sheetTotal: number | null
  rows: RequestImportPreviewRow[]
  duplicate: { id: string; requestNo: string; totalAmount: string } | null
}
export interface RequestImportResult {
  id: string
  requestNo: string
  lines: number
  totalAmount: number
  linkedItems: number
  unlinked: string[]
}
export interface PurchaseRequestLineBody {
  name?: string
  spec?: string | null
  brand?: string | null
  unit?: string | null
  quantity?: number
  unitPrice?: number | null
  department?: string | null
  requester?: string | null
  purpose?: string | null
  remark?: string | null
  itemId?: string | null
}

export type StockOverviewFilter = 'ALL' | 'ALERT' | 'LOW' | 'OUT' | 'IN_STOCK'
export interface StockOverviewRow {
  itemId: string
  code: string
  name: string
  spec: string | null
  brand: string | null
  unit: string
  category: string | null
  safetyStockThreshold: number | null
  quantity: number
  /** 平均成本，分 */
  avgCost: number
  status: 'OUT' | 'LOW' | 'OK' | 'NO_THRESHOLD'
  warehouses: { warehouseId: string; warehouseName: string; quantity: number }[]
  updatedAt: string | null
}
export interface StockOverview {
  summary: { itemCount: number; alertCount: number; outCount: number; lowCount: number; inStockCount: number; totalValue: number }
  rows: StockOverviewRow[]
}
