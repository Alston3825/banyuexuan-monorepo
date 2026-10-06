import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { routePermissionMap, firstAccessibleRoute, canAccessPerm } from '../layouts/nav-menu'
import { message } from '../utils/discrete-api'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layouts/AdminLayout.vue'),
    redirect: '/crm/customers',
    children: [
      { path: 'org/regions', name: 'regions', component: () => import('../views/org/RegionsView.vue'), meta: { title: '区域管理' } },
      { path: 'org/stores', name: 'stores', component: () => import('../views/org/StoresView.vue'), meta: { title: '门店管理' } },
      { path: 'org/departments', name: 'departments', component: () => import('../views/org/DepartmentsView.vue'), meta: { title: '部门管理' } },
      { path: 'org/teams', name: 'teams', component: () => import('../views/org/TeamsView.vue'), meta: { title: '班组管理' } },
      { path: 'org/positions', name: 'positions', component: () => import('../views/org/PositionsView.vue'), meta: { title: '职位管理' } },
      { path: 'crm/customers', name: 'crm-customers', component: () => import('../views/crm/CustomersView.vue'), meta: { title: '客户管理' } },
      // 新添/编辑客户是整页（不是弹窗）；/new 必须排在 /:id 前面，否则 "new" 会被当成客户 id
      { path: 'crm/customers/new', name: 'crm-customer-new', component: () => import('../views/crm/CustomerFormView.vue'), meta: { title: '新添客户' } },
      { path: 'crm/customers/:id/edit', name: 'crm-customer-edit', component: () => import('../views/crm/CustomerFormView.vue'), meta: { title: '编辑客户' } },
      { path: 'crm/channels', name: 'crm-channels', component: () => import('../views/crm/CustomerChannelsView.vue'), meta: { title: '客户渠道' } },
      { path: 'crm/customers/:id', name: 'crm-customer-detail', component: () => import('../views/crm/CustomerDetailView.vue'), meta: { title: '客户详情' } },
      { path: 'crm/leads', name: 'crm-leads', component: () => import('../views/crm/LeadsView.vue'), meta: { title: '客户线索' } },
      { path: 'crm/leads/:id', name: 'crm-lead-detail', component: () => import('../views/crm/LeadDetailView.vue'), meta: { title: '线索详情' } },
      { path: 'crm/opportunities', name: 'crm-opportunities', component: () => import('../views/crm/OpportunitiesView.vue'), meta: { title: '销售机会' } },
      { path: 'crm/opportunities/:id', name: 'crm-opportunity-detail', component: () => import('../views/crm/OpportunityDetailView.vue'), meta: { title: '销售机会详情' } },
      { path: 'contract/records', name: 'contract-records', component: () => import('../views/contract/ContractsView.vue'), meta: { title: '合同管理' } },
      { path: 'contract/records/:id', name: 'contract-record-detail', component: () => import('../views/contract/ContractDetailView.vue'), meta: { title: '合同详情' } },
      { path: 'room/types', name: 'room-types', component: () => import('../views/room/RoomTypesView.vue'), meta: { title: '房型管理' } },
      { path: 'room/rooms', name: 'room-rooms', component: () => import('../views/room/RoomsView.vue'), meta: { title: '房间管理' } },
      { path: 'room/board', name: 'room-board', component: () => import('../views/room/RoomBoardView.vue'), meta: { title: '房态看板' } },
      { path: 'room/board-horizontal', name: 'room-board-horizontal', component: () => import('../views/room/RoomHorizontalBoardView.vue'), meta: { title: '房态横排' } },
      { path: 'room/occupancies', name: 'room-occupancies', component: () => import('../views/room/RoomOccupanciesView.vue'), meta: { title: '预订记录' } },
      { path: 'care/board', name: 'care-board', component: () => import('../views/care/CareBoardView.vue'), meta: { title: '护理看板' } },
      { path: 'care/stats', name: 'care-stats', component: () => import('../views/care/CareStatsView.vue'), meta: { title: '护理统计' } },
      // 后台设置类页面合并成一个"护理设置"（标签页）；旧地址保留为跳转，老书签不会失效
      { path: 'care/settings', name: 'care-settings', component: () => import('../views/care/CareSettingsView.vue'), meta: { title: '护理设置' } },
      { path: 'care/fields', redirect: '/care/settings?tab=fields' },
      { path: 'care/form-templates', redirect: '/care/settings?tab=forms' },
      { path: 'care/plan-templates', redirect: '/care/settings?tab=plans' },
      { path: 'care/outreach-templates', redirect: '/care/settings?tab=outreach' },
      { path: 'care/outreach-tasks', name: 'care-outreach-tasks', component: () => import('../views/care/CareOutreachTasksView.vue'), meta: { title: '待跟进关怀' } },
      { path: 'care/profiles', name: 'care-profiles', component: () => import('../views/care/CareProfilesView.vue'), meta: { title: '母婴档案' } },
      { path: 'care/profiles/:id', name: 'care-profile-detail', component: () => import('../views/care/CareProfileDetailView.vue'), meta: { title: '母婴档案详情' } },
      { path: 'meal/items', name: 'meal-items', component: () => import('../views/meal/MealItemsView.vue'), meta: { title: '菜品管理' } },
      { path: 'meal/dietary-restrictions', name: 'meal-dietary-restrictions', component: () => import('../views/meal/DietaryRestrictionsView.vue'), meta: { title: '禁忌管理' } },
      { path: 'meal/plan-templates', name: 'meal-plan-templates', component: () => import('../views/meal/MealPlanTemplatesView.vue'), meta: { title: '膳食计划管理' } },
      { path: 'meal/diner-profiles', name: 'meal-diner-profiles', component: () => import('../views/meal/DinerProfilesView.vue'), meta: { title: '用膳人' } },
      { path: 'meal/diner-profiles/:id', name: 'meal-diner-profile-detail', component: () => import('../views/meal/DinerProfileDetailView.vue'), meta: { title: '用膳人详情' } },
      { path: 'meal/report', name: 'meal-report', component: () => import('../views/meal/MealReportView.vue'), meta: { title: '月子餐统计报表' } },
      { path: 'service/products', name: 'service-products', component: () => import('../views/service/ServiceProductsView.vue'), meta: { title: '产康项目' } },
      { path: 'service/packages', name: 'service-packages', component: () => import('../views/service/ServicePackagesView.vue'), meta: { title: '服务包' } },
      { path: 'service/therapists', name: 'service-therapists', component: () => import('../views/service/TherapistsView.vue'), meta: { title: '技师管理' } },
      { path: 'service/customer-packages', name: 'service-customer-packages', component: () => import('../views/service/CustomerServicePackagesView.vue'), meta: { title: '客户已购服务包' } },
      { path: 'service/appointments', name: 'service-appointments', component: () => import('../views/service/ServiceAppointmentsView.vue'), meta: { title: '预约管理' } },
      { path: 'service/report', name: 'service-report', component: () => import('../views/service/ServiceReportView.vue'), meta: { title: '产康结算报表' } },
      { path: 'inventory/suppliers', name: 'inventory-suppliers', component: () => import('../views/inventory/SuppliersView.vue'), meta: { title: '供应商管理' } },
      { path: 'inventory/warehouses', name: 'inventory-warehouses', component: () => import('../views/inventory/WarehousesView.vue'), meta: { title: '仓库管理' } },
      { path: 'inventory/items', name: 'inventory-items', component: () => import('../views/inventory/InventoryItemsView.vue'), meta: { title: '物品管理' } },
      { path: 'inventory/warehouse-stocks', name: 'inventory-warehouse-stocks', component: () => import('../views/inventory/WarehouseStocksView.vue'), meta: { title: '库存查询' } },
      { path: 'inventory/stock-batches', name: 'inventory-stock-batches', component: () => import('../views/inventory/StockBatchesView.vue'), meta: { title: '批次与效期' } },
      { path: 'inventory/purchase-requests', name: 'inventory-purchase-requests', component: () => import('../views/inventory/PurchaseRequestsView.vue'), meta: { title: '申购单' } },
      { path: 'inventory/purchase-orders', name: 'inventory-purchase-orders', component: () => import('../views/inventory/PurchaseOrdersView.vue'), meta: { title: '采购单' } },
      { path: 'inventory/goods-receipts', name: 'inventory-goods-receipts', component: () => import('../views/inventory/GoodsReceiptsView.vue'), meta: { title: '入库单' } },
      { path: 'inventory/stock-issues', name: 'inventory-stock-issues', component: () => import('../views/inventory/StockIssuesView.vue'), meta: { title: '出库/领用单' } },
      { path: 'inventory/stock-transfers', name: 'inventory-stock-transfers', component: () => import('../views/inventory/StockTransfersView.vue'), meta: { title: '调拨单' } },
      { path: 'inventory/stock-counts', name: 'inventory-stock-counts', component: () => import('../views/inventory/StockCountsView.vue'), meta: { title: '盘点单' } },
      { path: 'hr/employee-profiles', name: 'hr-employee-profiles', component: () => import('../views/hr/EmployeeProfilesView.vue'), meta: { title: '员工档案' } },
      { path: 'hr/shift-definitions', name: 'hr-shift-definitions', component: () => import('../views/hr/ShiftDefinitionsView.vue'), meta: { title: '班次定义' } },
      { path: 'hr/schedule-entries', name: 'hr-schedule-entries', component: () => import('../views/hr/ScheduleEntriesView.vue'), meta: { title: '排班管理' } },
      { path: 'hr/commission-records', name: 'hr-commission-records', component: () => import('../views/hr/CommissionRecordsView.vue'), meta: { title: '业绩提成' } },
      { path: 'hr/payroll-records', name: 'hr-payroll-records', component: () => import('../views/hr/PayrollRecordsView.vue'), meta: { title: '薪资管理' } },
      { path: 'finance/customer-accounts', name: 'finance-customer-accounts', component: () => import('../views/finance/CustomerAccountsView.vue'), meta: { title: '会员账户' } },
      { path: 'office/leave-requests', name: 'office-leave-requests', component: () => import('../views/office/LeaveRequestsView.vue'), meta: { title: '请假申请' } },
      { path: 'office/expense-claims', name: 'office-expense-claims', component: () => import('../views/office/ExpenseClaimsView.vue'), meta: { title: '报销申请' } },
      { path: 'office/general-memos', name: 'office-general-memos', component: () => import('../views/office/GeneralMemosView.vue'), meta: { title: '日常签呈' } },
      { path: 'logistics/vehicles', name: 'logistics-vehicles', component: () => import('../views/logistics/VehiclesView.vue'), meta: { title: '车辆管理' } },
      { path: 'logistics/vehicle-bookings', name: 'logistics-vehicle-bookings', component: () => import('../views/logistics/VehicleBookingsView.vue'), meta: { title: '用车申请' } },
      { path: 'logistics/utility-expenses', name: 'logistics-utility-expenses', component: () => import('../views/logistics/UtilityExpensesView.vue'), meta: { title: '水电费登记' } },
      { path: 'ai/knowledge-documents', name: 'ai-knowledge-documents', component: () => import('../views/ai/KnowledgeDocumentsView.vue'), meta: { title: '知识库文档' } },
      { path: 'iot/device-types', name: 'iot-device-types', component: () => import('../views/iot/DeviceTypesView.vue'), meta: { title: '设备类型' } },
      { path: 'iot/devices', name: 'iot-devices', component: () => import('../views/iot/DevicesView.vue'), meta: { title: '设备台账' } },
      { path: 'iot/device-events', name: 'iot-device-events', component: () => import('../views/iot/DeviceEventsView.vue'), meta: { title: '事件与模拟' } },
      { path: 'analytics/dashboard', name: 'analytics-dashboard', component: () => import('../views/analytics/AnalyticsDashboardView.vue'), meta: { title: '经营分析看板' } },
      { path: 'training/exams', name: 'training-exams', component: () => import('../views/training/TrainingExamsView.vue'), meta: { title: '试卷管理' } },
      { path: 'training/my-exams', name: 'training-my-exams', component: () => import('../views/training/MyExamsView.vue'), meta: { title: '我的考试' } },
      { path: 'training/grading', name: 'training-grading', component: () => import('../views/training/ExamGradingView.vue'), meta: { title: '考试批阅' } },
      { path: 'payment/records', name: 'payment-records', component: () => import('../views/payment/PaymentsView.vue'), meta: { title: '收款记录' } },
      { path: 'iam/accounts', name: 'accounts', component: () => import('../views/iam/AccountsView.vue'), meta: { title: '账号管理' } },
      { path: 'iam/roles', name: 'roles', component: () => import('../views/iam/RolesView.vue'), meta: { title: '角色管理' } },
      { path: 'iam/permissions', name: 'permissions', component: () => import('../views/iam/PermissionsView.vue'), meta: { title: '权限目录' } },
      { path: 'iam/applications', name: 'applications', component: () => import('../views/iam/ApplicationsView.vue'), meta: { title: '应用管理' } },
      { path: 'base/tags', name: 'tags', component: () => import('../views/base/TagsView.vue'), meta: { title: '标签管理' } },
      { path: 'base/parameters', name: 'parameters', component: () => import('../views/base/ParametersView.vue'), meta: { title: '参数配置' } },
      { path: 'workflow/demo-approvals', name: 'demo-approvals', component: () => import('../views/workflow/DemoApprovalsView.vue'), meta: { title: '示例审批单' } },
      { path: 'workflow/instances/:id', name: 'workflow-instance-detail', component: () => import('../views/workflow/WorkflowInstanceDetailView.vue'), meta: { title: '审批详情' } },
      { path: 'workflow/definitions', name: 'workflow-definitions', component: () => import('../views/workflow/WorkflowDefinitionsView.vue'), meta: { title: '流程定义' } },
      { path: 'audit-logs', name: 'audit-logs', component: () => import('../views/AuditLogView.vue'), meta: { title: '审计日志' } },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 详情页（如 /crm/customers/:id）不是导航菜单里的独立入口，routePermissionMap 只登记了
// 列表页的精确路径——按"最长前缀匹配"找到它归属的列表页权限，两者共用同一个权限点。
function resolveRequiredPermission(path: string): string | string[] | undefined {
  if (routePermissionMap[path]) return routePermissionMap[path]
  const prefixMatch = Object.keys(routePermissionMap)
    .filter((key) => path.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0]
  return prefixMatch ? routePermissionMap[prefixMatch] : undefined
}

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path === '/login') {
    if (auth.isAuthenticated) return firstAccessibleRoute(auth.hasAccess) ?? '/crm/customers'
    return true
  }
  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 前端这一层只是体验优化（不显示看不到的入口时顺带也别让直接改URL绕过去），
  // 真正兜底的鉴权在接口层的 PermissionGuard，这里判断错了也不会导致越权访问数据。
  const requiredPermission = resolveRequiredPermission(to.path)
  if (requiredPermission && !canAccessPerm(auth.hasAccess, requiredPermission)) {
    message.warning('无权限访问该页面')
    const fallback = firstAccessibleRoute(auth.hasAccess)
    // fallback 找不到（理论上不应该发生）就放行，避免在"哪都跳不过去"时把用户卡死在原地；
    // 真出现这种情况，接口层的 PermissionGuard 仍然会挡住任何越权的数据请求。
    if (!fallback || fallback === to.path) return true
    return fallback
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 伴月轩月子中心管理系统` : '伴月轩月子中心管理系统'
})
