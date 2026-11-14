import type { ScopedEntityBase } from './common'
import type { CustomerSource } from './customer'

export type LeadStatus = 'NEW' | 'ASSIGNED' | 'FOLLOWING' | 'CONVERTED' | 'LOST'

/** 预约类型：预约参观/预约试餐，文案见 utils/status-map.ts 的 LEAD_APPOINTMENT_TYPE_LABEL_MAP */
export type LeadAppointmentType = 'VISIT' | 'TRIAL_MEAL'

/** 处理结果（多选），文案见 utils/status-map.ts 的 LEAD_PROCESS_RESULT_LABEL_MAP */
export type LeadProcessResult = 'PHONE_VALID' | 'PHONE_INVALID' | 'WECHAT_ADDED' | 'PHONE_UNREACHABLE' | 'NOT_CONTACTED'

export interface Lead extends ScopedEntityBase {
  leadNo: string
  name: string
  phone: string
  source: CustomerSource
  storeId: string | null
  status: LeadStatus
  assignedToId: string | null
  customerId: string | null
  lostReason: string | null
  remark: string | null
  appointmentType: LeadAppointmentType | null
  appointmentTime: string | null
  appointmentNote: string | null
  processed: boolean
  processResults: LeadProcessResult[] | null
  handleRemark: string | null
}

export interface CreateLeadDto {
  name: string
  phone: string
  source: CustomerSource
  storeId?: string
  remark?: string
  customerId?: string
  appointmentType?: LeadAppointmentType
  appointmentTime?: string
  appointmentNote?: string
}

export interface UpdateLeadDto {
  name?: string
  phone?: string
  remark?: string
  customerId?: string
  appointmentType?: LeadAppointmentType
  appointmentTime?: string
  appointmentNote?: string
  processed?: boolean
  processResults?: LeadProcessResult[]
  handleRemark?: string
  version: number
}

export interface QueryLeadParams {
  status?: LeadStatus
  assignedToId?: string
  storeId?: string
}
