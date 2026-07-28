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
      { path: 'care/fields', name: 'care-fields', component: () => import('../views/care/CareFieldsView.vue'), meta: { title: '护理字段管理' } },
      { path: 'care/form-templates', name: 'care-form-templates', component: () => import('../views/care/CareFormTemplatesView.vue'), meta: { title: '护理项目管理' } },
      { path: 'care/plan-templates', name: 'care-plan-templates', component: () => import('../views/care/CarePlanTemplatesView.vue'), meta: { title: '护理方案管理' } },
      { path: 'care/profiles', name: 'care-profiles', component: () => import('../views/care/CareProfilesView.vue'), meta: { title: '母婴档案' } },
      { path: 'care/profiles/:id', name: 'care-profile-detail', component: () => import('../views/care/CareProfileDetailView.vue'), meta: { title: '母婴档案详情' } },
      { path: 'meal/items', name: 'meal-items', component: () => import('../views/meal/MealItemsView.vue'), meta: { title: '菜品管理' } },
      { path: 'meal/dietary-restrictions', name: 'meal-dietary-restrictions', component: () => import('../views/meal/DietaryRestrictionsView.vue'), meta: { title: '禁忌管理' } },
      { path: 'meal/plan-templates', name: 'meal-plan-templates', component: () => import('../views/meal/MealPlanTemplatesView.vue'), meta: { title: '膳食计划管理' } },
      { path: 'meal/diner-profiles', name: 'meal-diner-profiles', component: () => import('../views/meal/DinerProfilesView.vue'), meta: { title: '用膳人' } },
      { path: 'meal/diner-profiles/:id', name: 'meal-diner-profile-detail', component: () => import('../views/meal/DinerProfileDetailView.vue'), meta: { title: '用膳人详情' } },
      { path: 'service/products', name: 'service-products', component: () => import('../views/service/ServiceProductsView.vue'), meta: { title: '产康项目' } },
      { path: 'service/packages', name: 'service-packages', component: () => import('../views/service/ServicePackagesView.vue'), meta: { title: '服务包' } },
      { path: 'service/therapists', name: 'service-therapists', component: () => import('../views/service/TherapistsView.vue'), meta: { title: '技师管理' } },
      { path: 'service/customer-packages', name: 'service-customer-packages', component: () => import('../views/service/CustomerServicePackagesView.vue'), meta: { title: '客户已购服务包' } },
      { path: 'service/appointments', name: 'service-appointments', component: () => import('../views/service/ServiceAppointmentsView.vue'), meta: { title: '预约管理' } },
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
