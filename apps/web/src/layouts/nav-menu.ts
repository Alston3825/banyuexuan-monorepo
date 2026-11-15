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
  Document,
  Grid,
  Bed,
  Layers,
  Calendar,
  Cash,
  Woman,
  ClipboardOutline,
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
  WalletOutline,
  Card,
  CarOutline,
  FlashOutline,
  LibraryOutline,
  HardwareChipOutline,
  SchoolOutline,
  HeartOutline,
  NotificationsOutline,
  CheckmarkDoneOutline,
} from '@vicons/ionicons5'

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component) })
}

function linkLabel(label: string, to: string) {
  return () => h(RouterLink, { to }, { default: () => label })
}

interface NavLeaf {
  label: string
  to: string
  icon: Component
  /** 该菜单项对应的权限点code（见 apps/api/prisma/seed.ts 的 permSpecs），账号必须
   *  拥有这个code本身或它下面的任意子权限才会显示这一项——不是简单的"角色叫什么"，
   *  是真的按后端授予的权限点算，跟接口层 @RequirePermission 的判断口径完全一致。
   *  传数组表示"拥有其中任意一个就显示"（用于把几个后台设置页合并成一个入口）。 */
  perm: string | string[]
}

/** perm 可以是单个权限点或"任意一个"的数组 */
function hasAny(hasAccess: (perm: string) => boolean, perm: string | string[]): boolean {
  // 空权限表示登录即可使用的个人工作台；业务审批仍单独校验权限。
  if (perm === '') return true
  return Array.isArray(perm) ? perm.some((p) => hasAccess(p)) : hasAccess(perm)
}

/** 路由守卫用：账号是否满足该菜单项的权限要求 */
export function canAccessPerm(hasAccess: (perm: string) => boolean, perm: string | string[]): boolean {
  return hasAny(hasAccess, perm)
}

interface NavGroup {
  label: string
  key: string
  items: NavLeaf[]
}

// 分组原则：业务模块（客户签约履约相关，对应一线岗位日常操作）排在前面，
// 平台管理/系统配置类（组织架构、账号权限、基础资料、审批流程配置、审计日志）统一收在最后。
// 每一项都标了权限点code——菜单最终显示哪些，由 buildNavMenu() 按登录账号实际拥有的
// 权限动态过滤，不是所有账号看到的都一样（店员看不到经营分析/设备网关/账号权限/
// 基础资料/审计日志这类管理侧功能，见业务规则确认记录"导航菜单按权限显示"）。
const navGroups: NavGroup[] = [
  // ==================== 工作台：每个人每天先看这里 ====================
  {
    label: '工作台',
    key: 'group-workspace',
    items: [
      { label: '我的待办', to: '/workspace/todos', icon: NotificationsOutline, perm: '' },
      { label: '审批中心', to: '/workflow/approvals', icon: CheckmarkDoneOutline, perm: 'workflow.instance' },
    ],
  },
  // ==================== 业务模块 ====================
  {
    label: '经营分析',
    key: 'group-analytics',
    items: [{ label: '经营分析看板', to: '/analytics/dashboard', icon: StatsChartOutline, perm: 'analytics.dashboard' }],
  },
  {
    label: '客户档案',
    key: 'group-crm',
    items: [
      { label: '客户管理', to: '/crm/customers', icon: PersonAdd, perm: 'crm.customer' },
      { label: '客户线索', to: '/crm/leads', icon: People, perm: 'crm.lead' },
      { label: '客户渠道', to: '/crm/channels', icon: Pricetags, perm: 'crm.channel' },
      // 销售机会：只从导航隐藏，代码/路由/数据表都还在，以后需要随时能加回来，
      // 见 docs/业务规则确认记录.md"导航菜单/CRM模块调整"这一节的决定记录。
      // { label: '销售机会', to: '/crm/opportunities', icon: TrendingUp, perm: 'crm.opportunity' },
    ],
  },
  {
    label: '合同管理',
    key: 'group-contract',
    items: [
      { label: '合同管理', to: '/contract/records', icon: Document, perm: 'contract.record' },
    ],
  },
  {
    label: '住店运营',
    key: 'group-room',
    items: [
      { label: '房态看板', to: '/room/board', icon: Grid, perm: 'room.room' },
      { label: '房态横排', to: '/room/board-horizontal', icon: List, perm: 'room.occupancy' },
      { label: '房间管理', to: '/room/rooms', icon: Bed, perm: 'room.room' },
      { label: '房型管理', to: '/room/types', icon: Layers, perm: 'room.type' },
      { label: '预订记录', to: '/room/occupancies', icon: Calendar, perm: 'room.occupancy' },
      { label: '预订冲突', to: '/room/conflicts', icon: WarningOutline, perm: 'room.occupancy' },
    ],
  },
  {
    // 日常最常用的放前面（看板 → 档案 → 待跟进关怀）；后台设置类（护理字段/项目/方案/关怀模板）
    // 合并成最后一个入口"护理设置"，里面用标签页切换。其他模块以后也按这个思路整理。
    label: '母婴护理',
    key: 'group-care',
    items: [
      { label: '护理看板', to: '/care/board', icon: Woman, perm: 'care.board' },
      { label: '母婴档案', to: '/care/profiles', icon: Woman, perm: 'care.profile' },
      { label: '待跟进关怀', to: '/care/outreach-tasks', icon: HeartOutline, perm: 'care.outreach-plan' },
      { label: '护理统计', to: '/care/stats', icon: StatsChartOutline, perm: 'care.profile' },
      {
        label: '护理设置',
        to: '/care/settings',
        icon: ClipboardOutline,
        perm: ['care.field', 'care.form-template', 'care.plan-template', 'care.outreach-template'],
      },
    ],
  },
  {
    label: '满意度调查',
    key: 'group-satisfaction',
    items: [{ label: '满意度调查', to: '/satisfaction/surveys', icon: HeartOutline, perm: 'satisfaction.survey' }],
  },
  {
    label: '月子餐',
    key: 'group-meal',
    items: [
      { label: '用膳人', to: '/meal/diner-profiles', icon: PersonOutline, perm: 'meal.diner-profile' },
      { label: '菜品管理', to: '/meal/items', icon: FastFood, perm: 'meal.item' },
      { label: '禁忌管理', to: '/meal/dietary-restrictions', icon: NutritionOutline, perm: 'meal.dietary-restriction' },
      { label: '膳食计划管理', to: '/meal/plan-templates', icon: Restaurant, perm: 'meal.plan-template' },
      { label: '统计报表', to: '/meal/report', icon: StatsChartOutline, perm: 'meal.record' },
    ],
  },
  {
    label: '产康服务',
    key: 'group-service',
    items: [
      { label: '预约管理', to: '/service/appointments', icon: CalendarOutline, perm: 'service.appointment' },
      { label: '客户已购服务包', to: '/service/customer-packages', icon: Body, perm: 'service.customer-package' },
      { label: '产康项目', to: '/service/products', icon: Fitness, perm: 'service.product' },
      { label: '服务包', to: '/service/packages', icon: Layers, perm: 'service.package' },
      { label: '技师管理', to: '/service/therapists', icon: People, perm: 'service.therapist' },
      { label: '结算报表', to: '/service/report', icon: StatsChartOutline, perm: 'service.appointment' },
    ],
  },
  {
    label: '库存',
    key: 'group-inventory',
    items: [
      { label: '申购单', to: '/inventory/purchase-requests', icon: FileTrayFullOutline, perm: 'inventory.purchase-request' },
      { label: '采购单', to: '/inventory/purchase-orders', icon: FileTrayFullOutline, perm: 'inventory.purchase-order' },
      { label: '入库单', to: '/inventory/goods-receipts', icon: ArrowRedoOutline, perm: 'inventory.goods-receipt' },
      { label: '出库/领用单', to: '/inventory/stock-issues', icon: ArrowRedoOutline, perm: 'inventory.stock-issue' },
      { label: '调拨单', to: '/inventory/stock-transfers', icon: SwapHorizontalOutline, perm: 'inventory.stock-transfer' },
      { label: '盘点单', to: '/inventory/stock-counts', icon: ClipboardOutline, perm: 'inventory.stock-count' },
      { label: '库存查询', to: '/inventory/warehouse-stocks', icon: WarningOutline, perm: 'inventory.warehouse-stock' },
      { label: '批次与效期', to: '/inventory/stock-batches', icon: TimeOutline, perm: 'inventory.stock-batch' },
      { label: '物品管理', to: '/inventory/items', icon: CubeOutline, perm: 'inventory.item' },
      { label: '仓库管理', to: '/inventory/warehouses', icon: Layers, perm: 'inventory.warehouse' },
      { label: '供应商管理', to: '/inventory/suppliers', icon: BusinessOutline, perm: 'inventory.supplier' },
    ],
  },
  {
    label: '人事',
    key: 'group-hr',
    items: [
      { label: '员工档案', to: '/hr/employee-profiles', icon: PersonCircleOutline, perm: 'hr.employee-profile' },
      { label: '排班管理', to: '/hr/schedule-entries', icon: CalendarOutline, perm: 'hr.schedule-entry' },
      { label: '班次定义', to: '/hr/shift-definitions', icon: TimeOutline, perm: 'hr.shift-definition' },
      { label: '业绩提成', to: '/hr/commission-records', icon: TrendingUp, perm: 'hr.commission-record' },
      { label: '薪资管理', to: '/hr/payroll-records', icon: Cash, perm: 'hr.payroll-record' },
    ],
  },
  {
    label: '财务结算',
    key: 'group-payment',
    items: [
      { label: '收款记录', to: '/payment/records', icon: Cash, perm: 'payment.record' },
      { label: '会员账户', to: '/finance/customer-accounts', icon: WalletOutline, perm: 'finance.customer-account' },
    ],
  },
  {
    label: '办公审批',
    key: 'group-office',
    items: [
      { label: '请假申请', to: '/office/leave-requests', icon: Calendar, perm: 'office.leave-request' },
      { label: '报销申请', to: '/office/expense-claims', icon: Card, perm: 'office.expense-claim' },
      { label: '日常签呈', to: '/office/general-memos', icon: DocumentText, perm: 'office.general-memo' },
      // 原“审批流程”分组并入办公审批：示例审批单、流程设置（谁来审批、几级审批、处理时限）
      { label: '示例审批单', to: '/workflow/demo-approvals', icon: DocumentText, perm: 'workflow.demo-approval' },
      { label: '流程设置', to: '/workflow/settings', icon: List, perm: 'workflow.definition' },
    ],
  },
  {
    label: '后勤管理',
    key: 'group-logistics',
    items: [
      { label: '用车申请', to: '/logistics/vehicle-bookings', icon: CarOutline, perm: 'logistics.vehicle-booking' },
      { label: '车辆管理', to: '/logistics/vehicles', icon: CarOutline, perm: 'logistics.vehicle' },
      { label: '水电费登记', to: '/logistics/utility-expenses', icon: FlashOutline, perm: 'logistics.utility-expense' },
    ],
  },
  {
    label: 'AI助手',
    key: 'group-ai',
    items: [{ label: '知识库文档', to: '/ai/knowledge-documents', icon: LibraryOutline, perm: 'ai.knowledge-document' }],
  },
  {
    label: '培训与考核',
    key: 'group-training',
    items: [
      { label: '我的考试', to: '/training/my-exams', icon: SchoolOutline, perm: 'training.exam-attempt' },
      { label: '考试批阅', to: '/training/grading', icon: SchoolOutline, perm: 'training.exam-attempt' },
      { label: '试卷管理', to: '/training/exams', icon: SchoolOutline, perm: 'training.exam' },
    ],
  },

  // ==================== 平台管理 ====================
  {
    label: '组织架构',
    key: 'group-org',
    items: [
      { label: '区域管理', to: '/org/regions', icon: Folder, perm: 'platform.region' },
      { label: '门店管理', to: '/org/stores', icon: Storefront, perm: 'platform.store' },
      { label: '部门管理', to: '/org/departments', icon: Business, perm: 'platform.department' },
      { label: '班组管理', to: '/org/teams', icon: People, perm: 'platform.team' },
      { label: '职位管理', to: '/org/positions', icon: Clipboard, perm: 'platform.position' },
    ],
  },
  {
    label: '账号与权限',
    key: 'group-iam',
    items: [
      { label: '账号管理', to: '/iam/accounts', icon: People, perm: 'platform.account' },
      { label: '角色管理', to: '/iam/roles', icon: Key, perm: 'platform.role' },
      { label: '权限目录', to: '/iam/permissions', icon: Shield, perm: 'platform.permission' },
      { label: '应用管理', to: '/iam/applications', icon: Apps, perm: 'platform.application' },
    ],
  },
  {
    // 设备网关、基础资料（标签/参数）、审计日志都是超级管理员/总部才用的后台功能，合并成一个入口，
    // 菜单里不再各占一个分组；权限不变（按各自权限点显示，没有权限的项自动隐藏）。
    label: '系统管理',
    key: 'group-system',
    items: [
      { label: '系统集成（呼叫定位）', to: '/integration', icon: HardwareChipOutline, perm: ['integration.system', 'integration.binding'] },
      { label: '设备台账', to: '/iot/devices', icon: HardwareChipOutline, perm: 'iot.device-registry' },
      { label: '设备事件与模拟', to: '/iot/device-events', icon: HardwareChipOutline, perm: 'iot.device-event' },
      { label: '设备类型', to: '/iot/device-types', icon: HardwareChipOutline, perm: 'iot.device-type' },
      { label: '标签管理', to: '/base/tags', icon: Pricetags, perm: 'platform.tag' },
      { label: '参数配置', to: '/base/parameters', icon: Options, perm: 'platform.parameter' },
      { label: '回收站', to: '/recycle-bin', icon: DocumentText, perm: 'crm.customer.restore' },
      { label: '审计日志', to: '/audit-logs', icon: DocumentText, perm: 'audit.log' },
    ],
  },
]

/** 当前账号能进的全部页面（含所属分组、图标），给“我的待办·自定义快捷入口”挑选用 */
export function listNavLeaves(hasAccess: (perm: string) => boolean): { label: string; to: string; group: string; icon: Component }[] {
  return navGroups.flatMap((g) => g.items.filter((i) => hasAny(hasAccess, i.perm)).map((i) => ({ label: i.label, to: i.to, group: g.label, icon: i.icon })))
}

/** 不属于任何分组、直接挂在菜单最外层的单个入口 */
const standaloneItems: NavLeaf[] = []

/** 全部菜单项的 (路由path -> 所需权限code) 映射，供路由守卫复用，跟这里的菜单显示逻辑
 *  保持完全一致——避免"菜单里看不到，但直接输URL还是能进"这种两套判断口径不一致的情况。 */
export const routePermissionMap: Record<string, string | string[]> = Object.fromEntries(
  [...navGroups.flatMap((g) => g.items), ...standaloneItems].map((item) => [item.to, item.perm]),
)

function toMenuOption(item: NavLeaf): MenuOption {
  return { label: linkLabel(item.label, item.to), key: item.to, icon: icon(item.icon) }
}

/** 账号能访问的第一个页面，按菜单顺序找——路由守卫拦截无权限访问时用这个兜底跳转，
 *  不能简单固定跳 '/crm/customers'，普通员工以外的角色（比如以后配出的"仅后勤"角色）
 *  可能压根没有crm权限，硬跳过去会再被拦一次形成死循环。找不到任何有权限的页面时
 *  （理论上不应该发生——正常账号至少会挂一个角色）返回undefined，由调用方决定兜底行为。 */
export function firstAccessibleRoute(hasAccess: (perm: string) => boolean): string | undefined {
  for (const group of navGroups) {
    const item = group.items.find((i) => hasAny(hasAccess, i.perm))
    if (item) return item.to
  }
  return standaloneItems.find((i) => hasAny(hasAccess, i.perm))?.to
}

/** 按登录账号实际拥有的权限点动态生成导航菜单——整组都没权限的分组直接不显示，
 *  分组内单个菜单项没权限的也会被过滤掉（比如店长有platform.account但没有
 *  platform.role，"账号与权限"分组会显示，但里面只有"账号管理"一项）。
 *  hasAccess 传 useAuthStore().hasAccess，见 stores/auth.ts。 */
export function buildNavMenu(hasAccess: (perm: string) => boolean): MenuOption[] {
  const options: MenuOption[] = []
  for (const group of navGroups) {
    const visibleItems = group.items.filter((item) => hasAny(hasAccess, item.perm))
    if (visibleItems.length === 0) continue
    options.push({ type: 'group', label: group.label, key: group.key, children: visibleItems.map(toMenuOption) })
  }
  for (const item of standaloneItems) {
    if (hasAny(hasAccess, item.perm)) options.push(toMenuOption(item))
  }
  return options
}
