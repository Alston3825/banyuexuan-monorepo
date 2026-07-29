import { http } from '../client'
import type {
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
  create: (body: CreateInventoryItemDto) => http.post<InventoryItem>('/inventory/items', body).then((r) => r.data),
  update: (id: string, body: UpdateInventoryItemDto) => http.patch<InventoryItem>(`/inventory/items/${id}`, body).then((r) => r.data),
}

export const warehouseStockApi = {
  list: (params?: { warehouseId?: string; itemId?: string }) => http.get<WarehouseStock[]>('/inventory/warehouse-stocks', { params }).then((r) => r.data),
  lowStockAlerts: (params?: { warehouseId?: string }) =>
    http.get<WarehouseStock[]>('/inventory/warehouse-stocks/low-stock-alerts', { params }).then((r) => r.data),
}

export const stockBatchApi = {
  list: (params?: { warehouseId?: string; itemId?: string }) => http.get<StockBatch[]>('/inventory/stock-batches', { params }).then((r) => r.data),
  expiryAlerts: (params?: { warehouseId?: string; withinDays?: number }) =>
    http.get<StockBatchExpiryAlert[]>('/inventory/stock-batches/expiry-alerts', { params }).then((r) => r.data),
}

export const purchaseOrderApi = {
  list: (params?: { storeId?: string; warehouseId?: string; supplierId?: string; status?: string }) =>
    http.get<PurchaseOrder[]>('/inventory/purchase-orders', { params }).then((r) => r.data),
  get: (id: string) => http.get<PurchaseOrder>(`/inventory/purchase-orders/${id}`).then((r) => r.data),
  create: (body: CreatePurchaseOrderDto) => http.post<PurchaseOrder>('/inventory/purchase-orders', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<PurchaseOrder>(`/inventory/purchase-orders/${id}/submit`, { version }).then((r) => r.data),
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
