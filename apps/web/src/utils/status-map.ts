import { h } from 'vue'
import { NTag } from 'naive-ui'

export type TagType = 'default' | 'primary' | 'success' | 'info' | 'warning' | 'error'

export interface StatusMeta {
  label: string
  type: TagType
}

export function renderStatusBadge(value: string, map: Record<string, StatusMeta>) {
  const meta = map[value] ?? { label: value, type: 'default' as const }
  return h(NTag, { type: meta.type, round: true, size: 'small' }, { default: () => meta.label })
}

export const COMMON_STATUS_MAP: Record<string, StatusMeta> = {
  ACTIVE: { label: '启用', type: 'success' },
  INACTIVE: { label: '停用', type: 'default' },
}

export const STORE_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING: { label: '筹备中', type: 'warning' },
  ACTIVE: { label: '营业中', type: 'success' },
  CLOSED: { label: '已关闭', type: 'default' },
}

export const ACCOUNT_STATUS_MAP: Record<string, StatusMeta> = {
  ACTIVE: { label: '正常', type: 'success' },
  DISABLED: { label: '已禁用', type: 'default' },
  LOCKED: { label: '已锁定', type: 'error' },
}

export const APPLICATION_TYPE_MAP: Record<string, StatusMeta> = {
  WEB: { label: 'Web 端', type: 'info' },
  MOBILE: { label: '移动端', type: 'info' },
  OPENAPI: { label: '开放接口', type: 'info' },
}

export const WORKFLOW_INSTANCE_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  SUBMITTED: { label: '已提交', type: 'info' },
  IN_REVIEW: { label: '审批中', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'error' },
  WITHDRAWN: { label: '已撤回', type: 'default' },
  ARCHIVED: { label: '已归档', type: 'default' },
}

export const APPROVER_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING: { label: '待处理', type: 'warning' },
  APPROVED: { label: '已同意', type: 'success' },
  REJECTED: { label: '已拒绝', type: 'error' },
  REASSIGNED: { label: '已转交', type: 'default' },
  SKIPPED: { label: '已跳过', type: 'default' },
  NOTIFIED: { label: '已知会', type: 'info' },
}

export const WORKFLOW_ACTION_LABEL_MAP: Record<string, string> = {
  SUBMIT: '提交',
  APPROVE: '同意',
  REJECT: '驳回',
  WITHDRAW: '撤回',
  REASSIGN: '转交',
  ADD_APPROVER: '加签',
  CC: '抄送',
  ARCHIVE: '归档',
}

export const LEAD_STATUS_MAP: Record<string, StatusMeta> = {
  NEW: { label: '新线索', type: 'default' },
  ASSIGNED: { label: '已分配', type: 'info' },
  FOLLOWING: { label: '跟进中', type: 'warning' },
  CONVERTED: { label: '已转化', type: 'success' },
  LOST: { label: '已流失', type: 'error' },
}

export const OPPORTUNITY_STAGE_MAP: Record<string, StatusMeta> = {
  FOLLOWING: { label: '跟进中', type: 'warning' },
  QUOTED: { label: '报价中', type: 'info' },
  WON: { label: '已签约', type: 'success' },
  LOST: { label: '已流失', type: 'error' },
}

export const CONTRACT_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审核中', type: 'warning' },
  ACTIVE: { label: '已生效', type: 'success' },
  REJECTED: { label: '已驳回', type: 'error' },
  VOIDED: { label: '已作废', type: 'default' },
}

export const CUSTOMER_SOURCE_LABEL_MAP: Record<string, string> = {
  WALK_IN: '自然到店',
  REFERRAL: '转介绍',
  ONLINE_AD: '线上广告',
  SOCIAL_MEDIA: '社交媒体/私域',
  PARTNER: '渠道合作',
  OTHER: '其他',
}

export const FOLLOW_UP_TYPE_LABEL_MAP: Record<string, string> = {
  PHONE_CALL: '电话',
  WECHAT: '微信',
  SMS: '短信',
  ON_SITE_VISIT: '到访',
  INVITATION: '邀约',
  OTHER: '其他',
}

export const ROOM_STATUS_MAP: Record<string, StatusMeta> = {
  VACANT: { label: '空闲', type: 'success' },
  RESERVED: { label: '预订中', type: 'info' },
  OCCUPIED: { label: '使用中', type: 'warning' },
  PENDING_CLEANING: { label: '待清扫', type: 'error' },
  MAINTENANCE: { label: '维修中', type: 'default' },
}

export const ROOM_OCCUPANCY_STATUS_MAP: Record<string, StatusMeta> = {
  RESERVED: { label: '预订中', type: 'info' },
  CHECKED_IN: { label: '已入住', type: 'warning' },
  CHECKED_OUT: { label: '已离店', type: 'default' },
  CANCELLED: { label: '已取消', type: 'error' },
}

export const PAYMENT_STATUS_MAP: Record<string, StatusMeta> = {
  RECORDED: { label: '已收款', type: 'success' },
  PENDING_REFUND: { label: '退款审核中', type: 'warning' },
  REFUNDED: { label: '已退款', type: 'default' },
}

export const PAYMENT_METHOD_LABEL_MAP: Record<string, string> = {
  CASH: '现金',
  BANK_TRANSFER: '银行转账',
  WECHAT: '微信',
  ALIPAY: '支付宝',
  POS_CARD: 'POS 刷卡',
  OTHER: '其他',
}

export const SCOPE_TYPE_LABEL_MAP: Record<string, string> = {
  TENANT: '租户级',
  REGION: '区域级',
  STORE: '门店级',
  DEPARTMENT: '部门级',
  TEAM: '班组级',
  SELF: '仅本人',
}
