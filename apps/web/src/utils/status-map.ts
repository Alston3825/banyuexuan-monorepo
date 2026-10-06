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
  PENDING_REVIEW: { label: '待核对', type: 'warning' },
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审核中', type: 'warning' },
  ACTIVE: { label: '已确认', type: 'success' },
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

/** 客户类型（多选），code跟后端 customer-service-type.const.ts 保持一致 */
export const CUSTOMER_SERVICE_TYPE_LABEL_MAP: Record<string, string> = {
  MATERNITY_ROOM: '月子房客户',
  CONFINEMENT_NANNY: '月嫂上户客户',
  MEAL_DELIVERY: '月子餐外送',
  POSTPARTUM_RECOVERY: '产康客户',
  BABY_CARE: '宝宝托管',
}

/** 预约类型，code跟后端 Prisma LeadAppointmentType 保持一致 */
export const LEAD_APPOINTMENT_TYPE_LABEL_MAP: Record<string, string> = {
  VISIT: '预约参观',
  TRIAL_MEAL: '预约试餐',
}

/** 处理结果（多选），code跟后端 lead-process-result.const.ts 保持一致 */
export const LEAD_PROCESS_RESULT_LABEL_MAP: Record<string, string> = {
  PHONE_VALID: '电话有效',
  PHONE_INVALID: '电话无效',
  WECHAT_ADDED: '已加微信',
  PHONE_UNREACHABLE: '电话无法接通',
  NOT_CONTACTED: '未联系上',
}

/** 处理状态：未处理(红)/已处理(绿) */
export const LEAD_PROCESSED_MAP: Record<string, StatusMeta> = {
  false: { label: '未处理', type: 'error' },
  true: { label: '已处理', type: 'success' },
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

export const CARE_TARGET_TYPE_LABEL_MAP: Record<string, string> = {
  MOTHER: '妈妈',
  BABY: '宝宝',
}

export const CARE_FORM_DEPARTMENT_LABEL_MAP: Record<string, string> = {
  NURSING: '护理部',
  POSTPARTUM_RECOVERY: '产康部',
  MEAL: '膳食部',
  CUSTOMER_SERVICE: '客服部',
  MEDICAL: '医务部',
}

export const CARE_FORM_SCENE_LABEL_MAP: Record<string, string> = {
  GENERAL: '通用',
  IN_HOUSE: '所内',
  HOME_VISIT: '上户',
  HOSPITAL: '医院',
}

export const DELIVERY_METHOD_LABEL_MAP: Record<string, string> = {
  VAGINAL: '顺产',
  CESAREAN: '剖宫产',
  UNKNOWN: '未知',
}

export const BABY_GENDER_LABEL_MAP: Record<string, string> = {
  MALE: '男',
  FEMALE: '女',
  UNKNOWN: '未知',
}

export const CARE_PLAN_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  ACTIVE: { label: '进行中', type: 'success' },
  COMPLETED: { label: '已完成', type: 'default' },
  TERMINATED: { label: '已终止', type: 'error' },
}

export const CARE_PLAN_TASK_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING: { label: '待执行', type: 'warning' },
  COMPLETED: { label: '已完成', type: 'success' },
  MISSED: { label: '已错过', type: 'default' },
}

export const CARE_OUTREACH_PLAN_STATUS_MAP: Record<string, StatusMeta> = {
  ACTIVE: { label: '跟进中', type: 'warning' },
  COMPLETED: { label: '已完成', type: 'success' },
  TERMINATED: { label: '已终止', type: 'error' },
}

export const CARE_OUTREACH_TASK_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING: { label: '待跟进', type: 'warning' },
  COMPLETED: { label: '已完成', type: 'success' },
  SKIPPED: { label: '已跳过', type: 'default' },
}

export const CARE_ABNORMALITY_STATUS_MAP: Record<string, StatusMeta> = {
  OPEN: { label: '待处理', type: 'error' },
  FOLLOWING: { label: '跟进中', type: 'warning' },
  RESOLVED: { label: '已解决', type: 'success' },
  IGNORED: { label: '已忽略', type: 'default' },
}

export const ROOM_CALL_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING: { label: '待处理', type: 'warning' },
  HANDLED: { label: '已处理', type: 'success' },
}

export const ROOM_OUTING_STATUS_MAP: Record<string, StatusMeta> = {
  PLANNED: { label: '计划中', type: 'default' },
  OUT: { label: '已外出', type: 'warning' },
  RETURNED: { label: '已返回', type: 'success' },
  CANCELLED: { label: '已取消', type: 'error' },
}

export const ROOM_REQUISITION_STATUS_MAP: Record<string, StatusMeta> = {
  REQUESTED: { label: '待领用', type: 'warning' },
  FULFILLED: { label: '已完成', type: 'success' },
}

export const MEAL_SLOT_LABEL_MAP: Record<string, string> = {
  BREAKFAST: '早餐',
  MORNING_SNACK: '早点',
  LUNCH: '午餐',
  AFTERNOON_SNACK: '午点',
  DINNER: '晚餐',
  NIGHT_SNACK: '晚点',
}

export const MEAL_PLAN_TYPE_LABEL_MAP: Record<string, string> = {
  MONTH_MEAL: '月子餐',
  MINI_MONTH: '小月子',
  TRIAL: '试吃',
  DELIVERY: '外送餐',
  VIP: 'VIP',
}

export const DIETARY_RESTRICTION_CATEGORY_LABEL_MAP: Record<string, string> = {
  INGREDIENT: '食材类',
  MEDICAL: '病理性',
}

export const DINER_PROFILE_STATUS_MAP: Record<string, StatusMeta> = {
  ACTIVE: { label: '用膳中', type: 'success' },
  ENDED: { label: '已结束', type: 'default' },
}

export const MEAL_RECORD_STATUS_MAP: Record<string, StatusMeta> = {
  PLANNED: { label: '待供餐', type: 'warning' },
  SERVED: { label: '已供餐', type: 'success' },
  CANCELLED: { label: '已取消', type: 'error' },
}

export const CUSTOMER_SERVICE_PACKAGE_STATUS_MAP: Record<string, StatusMeta> = {
  ACTIVE: { label: '可用', type: 'success' },
  EXHAUSTED: { label: '已耗尽', type: 'default' },
}

export const SERVICE_APPOINTMENT_STATUS_MAP: Record<string, StatusMeta> = {
  BOOKED: { label: '已预约', type: 'warning' },
  COMPLETED: { label: '已完成', type: 'success' },
  CANCELLED: { label: '已取消', type: 'error' },
  NO_SHOW: { label: '爽约', type: 'error' },
}

export const INVENTORY_DOC_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审批中', type: 'warning' },
  APPROVED: { label: '已审批(待执行)', type: 'info' },
  REJECTED: { label: '已驳回', type: 'error' },
  CANCELLED: { label: '已取消', type: 'default' },
  COMPLETED: { label: '已完成', type: 'success' },
}

export const PURCHASE_REQUEST_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审批中', type: 'warning' },
  APPROVED: { label: '已批准(待生成采购单)', type: 'info' },
  REJECTED: { label: '已驳回', type: 'error' },
  CANCELLED: { label: '已取消', type: 'default' },
  ORDERED: { label: '已生成采购单', type: 'success' },
}

export const STOCK_ISSUE_TYPE_LABEL_MAP: Record<string, string> = {
  ISSUE: '一般出库',
  REQUISITION: '部门领用',
  LOSS: '报损',
}

export const WAREHOUSE_PURPOSE_LABEL_MAP: Record<string, string> = {
  OPERATING: '经营性',
  LOGISTICS: '后勤',
}

export const EMPLOYEE_PROFILE_STATUS_MAP: Record<string, StatusMeta> = {
  ACTIVE: { label: '在职', type: 'success' },
  ON_LEAVE: { label: '休假中', type: 'warning' },
  TERMINATED: { label: '已离职', type: 'default' },
}

export const EMPLOYMENT_TYPE_LABEL_MAP: Record<string, string> = {
  EMPLOYEE: '员工制',
  NON_EMPLOYEE: '非员工制',
}

export const CONTRACT_TYPE_LABEL_MAP: Record<string, string> = {
  LABOR: '劳动合同',
  PROBATION: '试用期合同',
  SERVICE: '劳务合同',
  OVERAGE: '用工协议（超龄）',
  PENDING_SIGN: '待签',
}

export const SOCIAL_INSURANCE_LABEL_MAP: Record<string, string> = {
  ENROLLED: '参保',
  NOT_ENROLLED: '未参保',
}

export const EMPLOYEE_GENDER_LABEL_MAP: Record<string, string> = {
  MALE: '男',
  FEMALE: '女',
}

export const COMMISSION_TYPE_LABEL_MAP: Record<string, string> = {
  SALES: '业绩提成',
  LABOR: '手工费',
}

export const COMMISSION_RECORD_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审批中', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'error' },
  CANCELLED: { label: '已取消', type: 'default' },
}

export const PAYROLL_RECORD_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审批中', type: 'warning' },
  APPROVED: { label: '已审批(待发放)', type: 'info' },
  REJECTED: { label: '已驳回', type: 'error' },
  CANCELLED: { label: '已取消', type: 'default' },
  PAID: { label: '已发放', type: 'success' },
}

export const CUSTOMER_ACCOUNT_TRANSACTION_TYPE_MAP: Record<string, StatusMeta> = {
  RECHARGE: { label: '充值', type: 'success' },
  CONSUME: { label: '消费', type: 'warning' },
  REFUND: { label: '退款', type: 'info' },
  ADJUST: { label: '人工调整', type: 'error' },
}

export const OFFICE_APPROVAL_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PENDING_APPROVAL: { label: '审批中', type: 'warning' },
  APPROVED: { label: '已批准', type: 'success' },
  REJECTED: { label: '已驳回', type: 'error' },
  CANCELLED: { label: '已取消', type: 'default' },
}

export const LEAVE_TYPE_LABEL_MAP: Record<string, string> = {
  SICK: '病假',
  PERSONAL: '事假',
  ANNUAL: '年假',
  OTHER: '其他',
}

export const VEHICLE_STATUS_MAP: Record<string, StatusMeta> = {
  AVAILABLE: { label: '可用', type: 'success' },
  MAINTENANCE: { label: '维修中', type: 'warning' },
  RETIRED: { label: '已报废', type: 'default' },
}

export const VEHICLE_BOOKING_STATUS_MAP: Record<string, StatusMeta> = {
  BOOKED: { label: '已预约', type: 'success' },
  CANCELLED: { label: '已取消', type: 'default' },
}

export const UTILITY_EXPENSE_TYPE_LABEL_MAP: Record<string, string> = {
  ELECTRICITY: '电费',
  WATER: '水费',
  GAS: '燃气费',
  PROPERTY_MANAGEMENT: '物业费',
  OTHER: '其他',
}

export const DEVICE_CATEGORY_LABEL_MAP: Record<string, string> = {
  VITAL_SIGN: '体征监测',
  SECURITY: '安防看护',
  ACCESS_CONTROL: '门禁出入',
  CALL_SERVICE: '呼叫/客房服务',
  IDENTITY_SETTLEMENT: '身份结算',
  PRINTING: '打印',
  UTILITY_METER: '能耗计量',
}

export const DEVICE_STATUS_MAP: Record<string, StatusMeta> = {
  ONLINE: { label: '在线', type: 'success' },
  OFFLINE: { label: '离线', type: 'default' },
  DISABLED: { label: '已停用', type: 'error' },
}

export const TRAINING_EXAM_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', type: 'default' },
  PUBLISHED: { label: '已发布', type: 'success' },
  ARCHIVED: { label: '已归档', type: 'default' },
}

export const EXAM_QUESTION_TYPE_LABEL_MAP: Record<string, string> = {
  SINGLE_CHOICE: '单选题',
  MULTIPLE_CHOICE: '多选题',
  TRUE_FALSE: '判断题',
  SHORT_ANSWER: '简答题',
}

export const EXAM_ATTEMPT_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING_GRADING: { label: '待批阅', type: 'warning' },
  COMPLETED: { label: '已完成', type: 'success' },
}

export const AI_SUGGESTION_STATUS_MAP: Record<string, StatusMeta> = {
  PENDING: { label: '待确认', type: 'warning' },
  ACCEPTED: { label: '已采纳', type: 'success' },
  DISMISSED: { label: '已忽略', type: 'default' },
}

export const SCOPE_TYPE_LABEL_MAP: Record<string, string> = {
  TENANT: '租户级',
  REGION: '区域级',
  STORE: '门店级',
  DEPARTMENT: '部门级',
  TEAM: '班组级',
  SELF: '仅本人',
}
