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
    redirect: '/org/regions',
    children: [
      { path: 'org/regions', name: 'regions', component: () => import('../views/org/RegionsView.vue'), meta: { title: '区域管理' } },
      { path: 'org/stores', name: 'stores', component: () => import('../views/org/StoresView.vue'), meta: { title: '门店管理' } },
      { path: 'org/departments', name: 'departments', component: () => import('../views/org/DepartmentsView.vue'), meta: { title: '部门管理' } },
      { path: 'org/teams', name: 'teams', component: () => import('../views/org/TeamsView.vue'), meta: { title: '班组管理' } },
      { path: 'org/positions', name: 'positions', component: () => import('../views/org/PositionsView.vue'), meta: { title: '职位管理' } },
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
    if (auth.isAuthenticated) return '/org/regions'
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
