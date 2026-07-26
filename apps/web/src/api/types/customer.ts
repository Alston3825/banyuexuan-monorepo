import type { ScopedEntityBase } from './common'

export type CustomerSource = 'WALK_IN' | 'REFERRAL' | 'ONLINE_AD' | 'SOCIAL_MEDIA' | 'PARTNER' | 'OTHER'

export interface Customer extends ScopedEntityBase {
  customerNo: string
  name: string
  phone: string
  source: CustomerSource
  primaryStoreId: string | null
  assignedToId: string | null
  remark: string | null
}

export interface CreateCustomerDto {
  name: string
  phone: string
  source: CustomerSource
  primaryStoreId?: string
  assignedToId?: string
  remark?: string
}

export interface UpdateCustomerDto {
  name?: string
  phone?: string
  assignedToId?: string
  remark?: string
  version: number
}

export interface QueryCustomerParams {
  assignedToId?: string
  primaryStoreId?: string
  keyword?: string
}
