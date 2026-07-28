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
