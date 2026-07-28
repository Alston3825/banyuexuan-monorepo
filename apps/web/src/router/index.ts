import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

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
      { path: 'crm/customers/:id', name: 'crm-customer-detail', component: () => import('../views/crm/CustomerDetailView.vue'), meta: { title: '客户详情' } },
      { path: 'crm/leads', name: 'crm-leads', component: () => import('../views/crm/LeadsView.vue'), meta: { title: '线索管理' } },
      { path: 'crm/leads/:id', name: 'crm-lead-detail', component: () => import('../views/crm/LeadDetailView.vue'), meta: { title: '线索详情' } },
      { path: 'crm/opportunities', name: 'crm-opportunities', component: () => import('../views/crm/OpportunitiesView.vue'), meta: { title: '销售机会' } },
      { path: 'crm/opportunities/:id', name: 'crm-opportunity-detail', component: () => import('../views/crm/OpportunityDetailView.vue'), meta: { title: '销售机会详情' } },
      { path: 'contract/templates', name: 'contract-templates', component: () => import('../views/contract/ContractTemplatesView.vue'), meta: { title: '合同模板' } },
      { path: 'contract/records', name: 'contract-records', component: () => import('../views/contract/ContractsView.vue'), meta: { title: '合同管理' } },
      { path: 'contract/records/:id', name: 'contract-record-detail', component: () => import('../views/contract/ContractDetailView.vue'), meta: { title: '合同详情' } },
      { path: 'contract/renewals', name: 'contract-renewals', component: () => import('../views/contract/ContractRenewalsView.vue'), meta: { title: '续签查询' } },
      { path: 'room/types', name: 'room-types', component: () => import('../views/room/RoomTypesView.vue'), meta: { title: '房型管理' } },
      { path: 'room/rooms', name: 'room-rooms', component: () => import('../views/room/RoomsView.vue'), meta: { title: '房间管理' } },
      { path: 'room/board', name: 'room-board', component: () => import('../views/room/RoomBoardView.vue'), meta: { title: '房态看板' } },
      { path: 'room/occupancies', name: 'room-occupancies', component: () => import('../views/room/RoomOccupanciesView.vue'), meta: { title: '预订记录' } },
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

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path === '/login') {
    if (auth.isAuthenticated) return '/crm/customers'
    return true
  }
  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 伴月轩月子中心管理系统` : '伴月轩月子中心管理系统'
})
