import type { ScopedEntityBase } from './common'
import type { CustomerSource } from './customer'

export type LeadStatus = 'NEW' | 'ASSIGNED' | 'FOLLOWING' | 'CONVERTED' | 'LOST'

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
}

export interface CreateLeadDto {
  name: string
  phone: string
  source: CustomerSource
  storeId?: string
  remark?: string
}

export interface UpdateLeadDto {
  name?: string
  phone?: string
  remark?: string
  version: number
}

export interface QueryLeadParams {
  status?: LeadStatus
  assignedToId?: string
  storeId?: string
}
