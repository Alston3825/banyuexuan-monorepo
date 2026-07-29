export type CustomerAccountTransactionType = 'RECHARGE' | 'CONSUME' | 'REFUND' | 'ADJUST'

export interface CustomerAccount {
  id: string
  tenantId: string
  customerId: string
  principalBalance: number
  giftBalance: number
  createdAt: string
  updatedAt: string
  version: number
}

export interface CustomerAccountTransaction {
  id: string
  tenantId: string
  accountId: string
  type: CustomerAccountTransactionType
  principalDelta: number
  giftDelta: number
  principalAfter: number
  giftAfter: number
  sourceType: string | null
  sourceId: string | null
  remark: string | null
  createdBy: string
  createdAt: string
}

export interface RechargeCustomerAccountDto {
  customerId: string
  principalAmount?: number
  giftAmount?: number
  remark?: string
}

export interface ConsumeCustomerAccountDto {
  customerId: string
  amount: number
  sourceType?: string
  sourceId?: string
  remark?: string
}

export interface RefundCustomerAccountDto {
  customerId: string
  principalAmount?: number
  giftAmount?: number
  sourceType?: string
  sourceId?: string
  remark?: string
}

export interface AdjustCustomerAccountDto {
  customerId: string
  principalDelta: number
  giftDelta: number
  remark: string
}
