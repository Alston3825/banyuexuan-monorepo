/** 审批单据类型 → 页面上显示的名称 + 单据所在页面（给待办/审批中心跳转用）。新增接入审批的业务模块时在这里加一行。 */
export const WORKFLOW_BUSINESS: Record<string, { label: string; path: string }> = {
  PURCHASE_REQUEST: { label: '申购单', path: '/inventory/purchase-requests' },
  PURCHASE_ORDER: { label: '采购单', path: '/inventory/purchase-orders' },
  GOODS_RECEIPT: { label: '入库单', path: '/inventory/goods-receipts' },
  STOCK_ISSUE: { label: '出库/领用单', path: '/inventory/stock-issues' },
  STOCK_TRANSFER: { label: '调拨单', path: '/inventory/stock-transfers' },
  STOCK_COUNT: { label: '盘点单', path: '/inventory/stock-counts' },
  LEAVE_REQUEST: { label: '请假申请', path: '/office/leave-requests' },
  EXPENSE_CLAIM: { label: '报销申请', path: '/office/expense-claims' },
  GENERAL_MEMO: { label: '日常签呈', path: '/office/general-memos' },
  COMMISSION_RECORD: { label: '业绩提成', path: '/hr/commission-records' },
  PAYROLL_RECORD: { label: '薪资单', path: '/hr/payroll-records' },
  PAYMENT: { label: '收款/退款', path: '/payment/records' },
  CONTRACT: { label: '合同', path: '/contract/records' },
  DEMO_APPROVAL: { label: '示例审批单', path: '/workflow/demo-approvals' },
};

export function businessLabel(type: string): string {
  return WORKFLOW_BUSINESS[type]?.label ?? type;
}

export function businessPath(type: string): string | null {
  return WORKFLOW_BUSINESS[type]?.path ?? null;
}
