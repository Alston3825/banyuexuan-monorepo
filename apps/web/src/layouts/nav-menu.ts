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
} from '@vicons/ionicons5'

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component) })
}

function linkLabel(label: string, to: string) {
  return () => h(RouterLink, { to }, { default: () => label })
}

export const navMenuOptions: MenuOption[] = [
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
