import { h, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { NIcon } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  Business,
  Storefront,
  Folder,
  People,
  Key,
  Shield,
  Apps,
  Pricetags,
  Options,
  DocumentText,
  List,
  Clipboard,
  PersonAdd,
  TrendingUp,
  Reader,
  Document,
  Grid,
  Bed,
  Layers,
  Calendar,
  Cash,
  Woman,
  ListOutline,
  ClipboardOutline,
  JournalOutline,
  Restaurant,
  NutritionOutline,
  FastFood,
  PersonOutline,
  Fitness,
  Body,
  CalendarOutline,
  StatsChartOutline,
  CubeOutline,
  FileTrayFullOutline,
  ArrowRedoOutline,
  SwapHorizontalOutline,
  BusinessOutline,
  WarningOutline,
  TimeOutline,
  PersonCircleOutline,
} from '@vicons/ionicons5'

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component) })
}

function linkLabel(label: string, to: string) {
  return () => h(RouterLink, { to }, { default: () => label })
}

// 导航分组原则：业务模块（客户签约履约相关，对应一线岗位日常操作）排在前面，
// 平台管理/系统配置类（组织架构、账号权限、基础资料、审批流程配置、审计日志）统一收在最后。
// 后续 P2/P3 新增护理、服务、月子餐、库存、财务、人事、办公等业务模块时，
// 一律插入"业务模块"分区（收款管理分组之前），不要插进平台管理分区。
export const navMenuOptions: MenuOption[] = [
  // ==================== 业务模块 ====================
  {
    type: 'group',
    label: '客户与线索',
    key: 'group-crm',
    children: [
      { label: linkLabel('客户管理', '/crm/customers'), key: '/crm/customers', icon: icon(PersonAdd) },
      { label: linkLabel('线索管理', '/crm/leads'), key: '/crm/leads', icon: icon(People) },
      { label: linkLabel('销售机会', '/crm/opportunities'), key: '/crm/opportunities', icon: icon(TrendingUp) },
    ],
  },
  {
    type: 'group',
    label: '合同管理',
    key: 'group-contract',
    children: [
      { label: linkLabel('合同模板', '/contract/templates'), key: '/contract/templates', icon: icon(Reader) },
      { label: linkLabel('合同管理', '/contract/records'), key: '/contract/records', icon: icon(Document) },
      { label: linkLabel('续签查询', '/contract/renewals'), key: '/contract/renewals', icon: icon(Reader) },
    ],
  },
  {
    type: 'group',
    label: '住店运营',
    key: 'group-room',
    children: [
      { label: linkLabel('房态看板', '/room/board'), key: '/room/board', icon: icon(Grid) },
      { label: linkLabel('房间管理', '/room/rooms'), key: '/room/rooms', icon: icon(Bed) },
      { label: linkLabel('房型管理', '/room/types'), key: '/room/types', icon: icon(Layers) },
      { label: linkLabel('预订记录', '/room/occupancies'), key: '/room/occupancies', icon: icon(Calendar) },
    ],
  },
  {
    type: 'group',
    label: '母婴护理',
    key: 'group-care',
    children: [
      { label: linkLabel('母婴档案', '/care/profiles'), key: '/care/profiles', icon: icon(Woman) },
      { label: linkLabel('护理字段管理', '/care/fields'), key: '/care/fields', icon: icon(ListOutline) },
      { label: linkLabel('护理项目管理', '/care/form-templates'), key: '/care/form-templates', icon: icon(ClipboardOutline) },
      { label: linkLabel('护理方案管理', '/care/plan-templates'), key: '/care/plan-templates', icon: icon(JournalOutline) },
    ],
  },
  {
    type: 'group',
    label: '月子餐',
    key: 'group-meal',
    children: [
      { label: linkLabel('用膳人', '/meal/diner-profiles'), key: '/meal/diner-profiles', icon: icon(PersonOutline) },
      { label: linkLabel('菜品管理', '/meal/items'), key: '/meal/items', icon: icon(FastFood) },
      { label: linkLabel('禁忌管理', '/meal/dietary-restrictions'), key: '/meal/dietary-restrictions', icon: icon(NutritionOutline) },
      { label: linkLabel('膳食计划管理', '/meal/plan-templates'), key: '/meal/plan-templates', icon: icon(Restaurant) },
      { label: linkLabel('统计报表', '/meal/report'), key: '/meal/report', icon: icon(StatsChartOutline) },
    ],
  },
  {
    type: 'group',
    label: '产康服务',
    key: 'group-service',
    children: [
      { label: linkLabel('预约管理', '/service/appointments'), key: '/service/appointments', icon: icon(CalendarOutline) },
      { label: linkLabel('客户已购服务包', '/service/customer-packages'), key: '/service/customer-packages', icon: icon(Body) },
      { label: linkLabel('产康项目', '/service/products'), key: '/service/products', icon: icon(Fitness) },
      { label: linkLabel('服务包', '/service/packages'), key: '/service/packages', icon: icon(Layers) },
      { label: linkLabel('技师管理', '/service/therapists'), key: '/service/therapists', icon: icon(People) },
      { label: linkLabel('结算报表', '/service/report'), key: '/service/report', icon: icon(StatsChartOutline) },
    ],
  },
  {
    type: 'group',
    label: '库存',
    key: 'group-inventory',
    children: [
      { label: linkLabel('采购单', '/inventory/purchase-orders'), key: '/inventory/purchase-orders', icon: icon(FileTrayFullOutline) },
      { label: linkLabel('入库单', '/inventory/goods-receipts'), key: '/inventory/goods-receipts', icon: icon(ArrowRedoOutline) },
      { label: linkLabel('出库/领用单', '/inventory/stock-issues'), key: '/inventory/stock-issues', icon: icon(ArrowRedoOutline) },
      { label: linkLabel('调拨单', '/inventory/stock-transfers'), key: '/inventory/stock-transfers', icon: icon(SwapHorizontalOutline) },
      { label: linkLabel('盘点单', '/inventory/stock-counts'), key: '/inventory/stock-counts', icon: icon(ClipboardOutline) },
      { label: linkLabel('库存查询', '/inventory/warehouse-stocks'), key: '/inventory/warehouse-stocks', icon: icon(WarningOutline) },
      { label: linkLabel('批次与效期', '/inventory/stock-batches'), key: '/inventory/stock-batches', icon: icon(TimeOutline) },
      { label: linkLabel('物品管理', '/inventory/items'), key: '/inventory/items', icon: icon(CubeOutline) },
      { label: linkLabel('仓库管理', '/inventory/warehouses'), key: '/inventory/warehouses', icon: icon(Layers) },
      { label: linkLabel('供应商管理', '/inventory/suppliers'), key: '/inventory/suppliers', icon: icon(BusinessOutline) },
    ],
  },
  {
    type: 'group',
    label: '人事',
    key: 'group-hr',
    children: [
      { label: linkLabel('员工档案', '/hr/employee-profiles'), key: '/hr/employee-profiles', icon: icon(PersonCircleOutline) },
      { label: linkLabel('排班管理', '/hr/schedule-entries'), key: '/hr/schedule-entries', icon: icon(CalendarOutline) },
      { label: linkLabel('班次定义', '/hr/shift-definitions'), key: '/hr/shift-definitions', icon: icon(TimeOutline) },
      { label: linkLabel('业绩提成', '/hr/commission-records'), key: '/hr/commission-records', icon: icon(TrendingUp) },
      { label: linkLabel('薪资管理', '/hr/payroll-records'), key: '/hr/payroll-records', icon: icon(Cash) },
    ],
  },
  {
    type: 'group',
    label: '收款管理',
    key: 'group-payment',
    children: [{ label: linkLabel('收款记录', '/payment/records'), key: '/payment/records', icon: icon(Cash) }],
  },

  // ==================== 平台管理 ====================
  {
    type: 'group',
    label: '组织架构',
    key: 'group-org',
    children: [
      { label: linkLabel('区域管理', '/org/regions'), key: '/org/regions', icon: icon(Folder) },
      { label: linkLabel('门店管理', '/org/stores'), key: '/org/stores', icon: icon(Storefront) },
      { label: linkLabel('部门管理', '/org/departments'), key: '/org/departments', icon: icon(Business) },
      { label: linkLabel('班组管理', '/org/teams'), key: '/org/teams', icon: icon(People) },
      { label: linkLabel('职位管理', '/org/positions'), key: '/org/positions', icon: icon(Clipboard) },
    ],
  },
  {
    type: 'group',
    label: '账号与权限',
    key: 'group-iam',
    children: [
      { label: linkLabel('账号管理', '/iam/accounts'), key: '/iam/accounts', icon: icon(People) },
      { label: linkLabel('角色管理', '/iam/roles'), key: '/iam/roles', icon: icon(Key) },
      { label: linkLabel('权限目录', '/iam/permissions'), key: '/iam/permissions', icon: icon(Shield) },
      { label: linkLabel('应用管理', '/iam/applications'), key: '/iam/applications', icon: icon(Apps) },
    ],
  },
  {
    type: 'group',
    label: '基础资料',
    key: 'group-base',
    children: [
      { label: linkLabel('标签管理', '/base/tags'), key: '/base/tags', icon: icon(Pricetags) },
      { label: linkLabel('参数配置', '/base/parameters'), key: '/base/parameters', icon: icon(Options) },
    ],
  },
  {
    type: 'group',
    label: '审批流程',
    key: 'group-workflow',
    children: [
      { label: linkLabel('示例审批单', '/workflow/demo-approvals'), key: '/workflow/demo-approvals', icon: icon(DocumentText) },
      { label: linkLabel('流程定义', '/workflow/definitions'), key: '/workflow/definitions', icon: icon(List) },
    ],
  },
  { label: linkLabel('审计日志', '/audit-logs'), key: '/audit-logs', icon: icon(DocumentText) },
]
