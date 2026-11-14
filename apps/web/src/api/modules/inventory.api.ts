import { http } from '../client'
import type {
  ItemPriceHistory,
  StockOverview,
  StockOverviewFilter,
  CreateGoodsReceiptDto,
  CreateInventoryItemDto,
  CreatePurchaseOrderDto,
  CreateStockCountDto,
  CreateStockIssueDto,
  CreateStockTransferDto,
  CreateSupplierDto,
  CreateWarehouseDto,
  GoodsReceipt,
  InventoryItem,
  ItemImportPreview,
  PurchaseRequest,
  PurchaseRequestLineBody,
  PurchaseRequestStatus,
  PurchaseRequestKind,
  RequestImportPreview,
  RequestImportResult,
  RequestImportRow,
  ItemImportResult,
  ItemImportRow,
  WarehousePurpose,
  PurchaseOrder,
  StockBatch,
  StockBatchExpiryAlert,
  StockCount,
  StockIssue,
  StockTransfer,
  Supplier,
  UpdateInventoryItemDto,
  UpdateSupplierDto,
  UpdateWarehouseDto,
  Warehouse,
  WarehouseStock,
  SimilarItem,
} from '../types/inventory'

export const supplierApi = {
  list: () => http.get<Supplier[]>('/inventory/suppliers').then((r) => r.data),
  create: (body: CreateSupplierDto) => http.post<Supplier>('/inventory/suppliers', body).then((r) => r.data),
  update: (id: string, body: UpdateSupplierDto) => http.patch<Supplier>(`/inventory/suppliers/${id}`, body).then((r) => r.data),
}

export const warehouseApi = {
  list: (params?: { storeId?: string }) => http.get<Warehouse[]>('/inventory/warehouses', { params }).then((r) => r.data),
  create: (body: CreateWarehouseDto) => http.post<Warehouse>('/inventory/warehouses', body).then((r) => r.data),
  update: (id: string, body: UpdateWarehouseDto) => http.patch<Warehouse>(`/inventory/warehouses/${id}`, body).then((r) => r.data),
}

export const inventoryItemApi = {
  list: () => http.get<InventoryItem[]>('/inventory/items').then((r) => r.data),
  /** 选物品的搜索框：按名称/规格/品牌/编码模糊搜，最多 30 条 */
  search: (keyword?: string) =>
    http
      .get<{ id: string; code: string; name: string; spec: string | null; brand: string | null; unit: string; referencePrice: string | number | null }[]>('/inventory/items/search', { params: { keyword: keyword || undefined } })
      .then((r) => r.data),
  /** 新物品入库前查重：名称相近的已有物品 */
  similar: (name: string, spec?: string) =>
    http.get<SimilarItem[]>('/inventory/items/similar', { params: { name, spec: spec || undefined } }).then((r) => r.data),
  create: (body: CreateInventoryItemDto) => http.post<InventoryItem>('/inventory/items', body).then((r) => r.data),
  update: (id: string, body: UpdateInventoryItemDto) => http.patch<InventoryItem>(`/inventory/items/${id}`, body).then((r) => r.data),
  /** 删除前检查：DELETE=可直接删；HIDE=有记录只能隐藏；BLOCKED=还有库存不能删 */
  deleteCheck: (id: string) =>
    http.get<{ stockQty: number; recordCount: number; outcome: 'DELETE' | 'HIDE' | 'BLOCKED'; reason: string }>(`/inventory/items/${id}/delete-check`).then((r) => r.data),
  priceHistory: (id: string) => http.get<ItemPriceHistory>(`/inventory/items/${id}/price-history`).then((r) => r.data),
  remove: (id: string) => http.delete<{ outcome: 'DELETED' | 'HIDDEN'; message: string }>(`/inventory/items/${id}`).then((r) => r.data),
  /** Excel 导入第一步：上传表格，返回识别结果供核对（不入库） */
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<ItemImportPreview>('/inventory/items/import/preview', form, { timeout: 60_000 }).then((r) => r.data)
  },
  /** Excel 导入第二步：确认入库 */
  importCommit: (body: { items: ItemImportRow[]; purpose: WarehousePurpose; category?: string; updateExisting: boolean }) =>
    http.post<ItemImportResult>('/inventory/items/import/commit', body, { timeout: 60_000 }).then((r) => r.data),
}

export const warehouseStockApi = {
  /** 库存总览：每种物品一行（没入过库的数量 0），带预警状态和汇总 */
  overview: (params?: { warehouseId?: string; keyword?: string; status?: StockOverviewFilter }) =>
    http.get<StockOverview>('/inventory/warehouse-stocks/overview', { params }).then((r) => r.data),
  list: (params?: { warehouseId?: string; itemId?: string }) => http.get<WarehouseStock[]>('/inventory/warehouse-stocks', { params }).then((r) => r.data),
  lowStockAlerts: (params?: { warehouseId?: string }) =>
    http.get<WarehouseStock[]>('/inventory/warehouse-stocks/low-stock-alerts', { params }).then((r) => r.data),
}

export const stockBatchApi = {
  list: (params?: { warehouseId?: string; itemId?: string }) => http.get<StockBatch[]>('/inventory/stock-batches', { params }).then((r) => r.data),
  expiryAlerts: (params?: { warehouseId?: string; withinDays?: number }) =>
    http.get<StockBatchExpiryAlert[]>('/inventory/stock-batches/expiry-alerts', { params }).then((r) => r.data),
}

export interface LogisticsMeta {
  configured: boolean
  companies: { code: string; name: string }[]
  platforms: string[]
  stateLabels: Record<string, string>
}
export interface PurchaseLogistics {
  id: string
  platform: string | null
  platformOrderNo: string | null
  expressNo: string | null
  expressCompany: string | null
  expressCompanyName: string | null
  expressPhoneTail: string | null
  logisticsState: number | null
  logisticsStateLabel: string | null
  trace: { time: string; context: string; location?: string }[]
  checkedAt: string | null
  error: string | null
}

export interface Import1688Order {
  orderNo: string
  seller: string
  sellerMember: string
  status: string
  createdAt: string | null
  goodsTotal: number
  freight: number
  paid: number
  titles: string[]
  expressCompanyRaw: string
  expressCompany: string | null
  expressNos: string[]
}
export interface Import1688PoBrief {
  id: string
  orderNo: string
  supplierName: string
  status: string
  totalAmount: number
  createdAt: string
  itemsText: string
  expressNo: string | null
  platformOrderNo: string | null
}
export interface Import1688Row {
  order: Import1688Order
  confidence: 'high' | 'medium' | 'none'
  score: number
  reasons: string[]
  match: Import1688PoBrief | null
  alternatives: Import1688PoBrief[]
  alreadyLinked: boolean
  notes: string[]
}
export interface Import1688CommitItem {
  purchaseOrderId: string
  platformOrderNo: string
  sellerName?: string | null
  goodsTitle?: string | null
  paid?: number
  orderStatus?: string | null
  expressCompany?: string | null
  expressNos?: string[]
}
/** 采购单下的一笔平台订单/一个运单号 */
export interface PurchaseShipment {
  id: string
  platform: string
  platformOrderNo: string
  sellerName: string | null
  goodsTitle: string | null
  amount: number
  orderStatus: string | null
  expressCompany: string | null
  expressCompanyName: string | null
  expressNo: string
  logisticsState: number | null
  logisticsStateLabel: string | null
  trace: { time: string; context: string; location?: string }[]
  checkedAt: string | null
  error: string | null
}

export const purchaseOrderApi = {
  /** 导入 1688 导出的订单表：第一步智能对应（不写库），第二步确认后登记订单号和运单号 */
  import1688Preview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<{ rows: Import1688Row[]; total: number }>('/inventory/purchase-orders/import-1688/preview', form, { timeout: 60_000 }).then((r) => r.data)
  },
  import1688Commit: (items: Import1688CommitItem[]) =>
    http.post<{ results: { purchaseOrderId: string; platformOrderNo: string; ok: boolean; error?: string }[]; okCount: number; querying: number }>('/inventory/purchase-orders/import-1688/commit', { items }, { timeout: 120_000 }).then((r) => r.data),
  list: (params?: { storeId?: string; warehouseId?: string; supplierId?: string; status?: string }) =>
    http.get<PurchaseOrder[]>('/inventory/purchase-orders', { params }).then((r) => r.data),
  get: (id: string) => http.get<PurchaseOrder>(`/inventory/purchase-orders/${id}`).then((r) => r.data),
  create: (body: CreatePurchaseOrderDto) => http.post<PurchaseOrder>('/inventory/purchase-orders', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<PurchaseOrder>(`/inventory/purchase-orders/${id}/submit`, { version }).then((r) => r.data),
  /** 采购员确认已完成采购：采购单变“已采购”，并自动生成待收货的入库单 */
  confirmPurchase: (id: string, body: { version: number; expressNo?: string; note?: string }) =>
    http.post<{ order: PurchaseOrder; receipt: { id: string; receiptNo: string } }>(`/inventory/purchase-orders/${id}/confirm-purchase`, body).then((r) => r.data),
  /** 物流：下拉选项、登记平台/单号、查看和刷新轨迹（快递100） */
  logisticsMeta: () => http.get<LogisticsMeta>('/inventory/purchase-orders/logistics-meta').then((r) => r.data),
  shipments: (id: string) => http.get<PurchaseShipment[]>(`/inventory/purchase-orders/${id}/shipments`).then((r) => r.data),
  refreshShipments: (id: string) => http.post<{ queued: number }>(`/inventory/purchase-orders/${id}/shipments/refresh`).then((r) => r.data),
  refreshShipment: (id: string, sid: string) => http.post<PurchaseShipment>(`/inventory/purchase-orders/${id}/shipments/${sid}/refresh`).then((r) => r.data),
  logistics: (id: string) => http.get<PurchaseLogistics>(`/inventory/purchase-orders/${id}/logistics`).then((r) => r.data),
  saveLogistics: (id: string, body: Partial<Pick<PurchaseLogistics, 'platform' | 'platformOrderNo' | 'expressNo' | 'expressCompany' | 'expressPhoneTail'>>) =>
    http.patch<PurchaseLogistics>(`/inventory/purchase-orders/${id}/logistics`, body).then((r) => r.data),
  refreshLogistics: (id: string) => http.post<PurchaseLogistics>(`/inventory/purchase-orders/${id}/logistics/refresh`).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<PurchaseOrder>(`/inventory/purchase-orders/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const goodsReceiptApi = {
  list: (params?: { storeId?: string; warehouseId?: string; status?: string }) =>
    http.get<GoodsReceipt[]>('/inventory/goods-receipts', { params }).then((r) => r.data),
  get: (id: string) => http.get<GoodsReceipt>(`/inventory/goods-receipts/${id}`).then((r) => r.data),
  create: (body: CreateGoodsReceiptDto) => http.post<GoodsReceipt>('/inventory/goods-receipts', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<GoodsReceipt>(`/inventory/goods-receipts/${id}/submit`, { version }).then((r) => r.data),
  execute: (id: string, version: number) => http.post<GoodsReceipt>(`/inventory/goods-receipts/${id}/execute`, { version }).then((r) => r.data),
  /** 收货确认：快递到货后逐项确认到了几个，确认即入库（可分多次） */
  receive: (id: string, body: { lines: { receiptItemId: string; quantity: number; expiresAt?: string; note?: string }[]; expressNo?: string; note?: string }) =>
    http.post<GoodsReceipt>(`/inventory/goods-receipts/${id}/receive`, body).then((r) => r.data),
  closeShort: (id: string, reason: string) => http.post<GoodsReceipt>(`/inventory/goods-receipts/${id}/close-short`, { reason }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<GoodsReceipt>(`/inventory/goods-receipts/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const stockIssueApi = {
  list: (params?: { storeId?: string; warehouseId?: string; issueType?: string; status?: string }) =>
    http.get<StockIssue[]>('/inventory/stock-issues', { params }).then((r) => r.data),
  get: (id: string) => http.get<StockIssue>(`/inventory/stock-issues/${id}`).then((r) => r.data),
  create: (body: CreateStockIssueDto) => http.post<StockIssue>('/inventory/stock-issues', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<StockIssue>(`/inventory/stock-issues/${id}/submit`, { version }).then((r) => r.data),
  execute: (id: string, version: number) => http.post<StockIssue>(`/inventory/stock-issues/${id}/execute`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<StockIssue>(`/inventory/stock-issues/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const stockTransferApi = {
  list: (params?: { fromWarehouseId?: string; toWarehouseId?: string; status?: string }) =>
    http.get<StockTransfer[]>('/inventory/stock-transfers', { params }).then((r) => r.data),
  get: (id: string) => http.get<StockTransfer>(`/inventory/stock-transfers/${id}`).then((r) => r.data),
  create: (body: CreateStockTransferDto) => http.post<StockTransfer>('/inventory/stock-transfers', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<StockTransfer>(`/inventory/stock-transfers/${id}/submit`, { version }).then((r) => r.data),
  execute: (id: string, version: number) => http.post<StockTransfer>(`/inventory/stock-transfers/${id}/execute`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<StockTransfer>(`/inventory/stock-transfers/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const stockCountApi = {
  list: (params?: { storeId?: string; warehouseId?: string; status?: string }) =>
    http.get<StockCount[]>('/inventory/stock-counts', { params }).then((r) => r.data),
  get: (id: string) => http.get<StockCount>(`/inventory/stock-counts/${id}`).then((r) => r.data),
  create: (body: CreateStockCountDto) => http.post<StockCount>('/inventory/stock-counts', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<StockCount>(`/inventory/stock-counts/${id}/submit`, { version }).then((r) => r.data),
  execute: (id: string, version: number) => http.post<StockCount>(`/inventory/stock-counts/${id}/execute`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<StockCount>(`/inventory/stock-counts/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const purchaseRequestApi = {
  list: (params?: { storeId?: string; status?: PurchaseRequestStatus; kind?: PurchaseRequestKind }) => http.get<PurchaseRequest[]>('/inventory/purchase-requests', { params }).then((r) => r.data),
  /** 手动新建申购单（汇总申购单草稿）：物品从物品库选，或填没采购过的新物品 */
  create: (body: { storeId: string; requestDate?: string; remark?: string; items: PurchaseRequestLineBody[]; createMissingItems?: boolean }) =>
    http.post<PurchaseRequest>('/inventory/purchase-requests', body).then((r) => r.data),
  /** 部门负责人新建部门申购单（submit=true 直接提交给客服汇总） */
  createDepartment: (body: { items: PurchaseRequestLineBody[]; remark?: string; storeId?: string; submit?: boolean }) =>
    http.post<PurchaseRequest>('/inventory/purchase-requests/department', body).then((r) => r.data),
  /** 客服汇总：把勾选的已提交部门申购单合成一张汇总申购单 */
  collect: (ids: string[], remark?: string) => http.post<PurchaseRequest>('/inventory/purchase-requests/collect', { ids, remark }).then((r) => r.data),
  recall: (id: string, version: number) => http.post<PurchaseRequest>(`/inventory/purchase-requests/${id}/recall`, { version }).then((r) => r.data),
  get: (id: string) => http.get<PurchaseRequest>(`/inventory/purchase-requests/${id}`).then((r) => r.data),
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<RequestImportPreview>('/inventory/purchase-requests/import/preview', form, { timeout: 60_000 }).then((r) => r.data)
  },
  duplicate: (storeId: string, requestDate: string) =>
    http.get<{ id: string; requestNo: string; totalAmount: string } | ''>('/inventory/purchase-requests/import/duplicate', { params: { storeId, requestDate } }).then((r) => r.data || null),
  importCommit: (body: { storeId: string; requestDate?: string; sourceFileName?: string; remark?: string; rows: RequestImportRow[]; createMissingItems: boolean; allowDuplicate: boolean }) =>
    http.post<RequestImportResult>('/inventory/purchase-requests/import/commit', body, { timeout: 60_000 }).then((r) => r.data),
  addLine: (id: string, body: PurchaseRequestLineBody, version: number) => http.post<PurchaseRequest>(`/inventory/purchase-requests/${id}/items`, { ...body, version }).then((r) => r.data),
  updateLine: (id: string, lineId: string, body: PurchaseRequestLineBody, version: number) =>
    http.patch<PurchaseRequest>(`/inventory/purchase-requests/${id}/items/${lineId}`, { ...body, version }).then((r) => r.data),
  removeLine: (id: string, lineId: string, version: number) => http.delete<PurchaseRequest>(`/inventory/purchase-requests/${id}/items/${lineId}`, { params: { version } }).then((r) => r.data),
  submit: (id: string, version: number) => http.post<PurchaseRequest>(`/inventory/purchase-requests/${id}/submit`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) => http.post<PurchaseRequest>(`/inventory/purchase-requests/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
  convert: (id: string, body: { supplierId: string; warehouseId: string; version: number; fixes?: { lineId: string; unitPrice?: number; itemId?: string }[] }) =>
    http.post<{ request: PurchaseRequest; purchaseOrder: { id: string; orderNo: string }; amountDiff: number }>(`/inventory/purchase-requests/${id}/convert`, body).then((r) => r.data),
}
