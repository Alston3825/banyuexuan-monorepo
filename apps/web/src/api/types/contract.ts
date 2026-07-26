import type { ScopedEntityBase } from './common'

export type ContractStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'VOIDED'

export interface Contract extends ScopedEntityBase {
  contractNo: string
  customerId: string
  opportunityId: string | null
  templateId: string | null
  storeId: string
  title: string
  content: string
  amount: number
  startDate: string
  endDate: string
  status: ContractStatus
  signedByCustomerAt: string | null
  signedByCustomerIp: string | null
  renewalOfContractId: string | null
  voidReason: string | null
}

export interface CreateContractDto {
  customerId: string
  opportunityId?: string
  templateId?: string
  storeId: string
  title: string
  content: string
  amount: number
  startDate: string
  endDate: string
}

export interface UpdateContractDto {
  title?: string
  content?: string
  amount?: number
  startDate?: string
  endDate?: string
  version: number
}

export interface RenewContractDto {
  startDate: string
  endDate: string
  amount?: number
  content?: string
  version: number
}

export interface QueryContractParams {
  customerId?: string
  storeId?: string
  status?: ContractStatus
}
