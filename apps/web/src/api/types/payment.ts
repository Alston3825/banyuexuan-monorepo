import type { ScopedEntityBase } from './common'

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'WECHAT' | 'ALIPAY' | 'POS_CARD' | 'OTHER'
export type PaymentStatus = 'RECORDED' | 'PENDING_REFUND' | 'REFUNDED'

export interface Payment extends ScopedEntityBase {
  paymentNo: string
  contractId: string
  customerId: string
  storeId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  refundReason: string | null
  remark: string | null
}

export interface CreatePaymentDto {
  contractId: string
  customerId: string
  storeId: string
  amount: number
  method?: PaymentMethod
  remark?: string
}

export interface QueryPaymentParams {
  contractId?: string
  customerId?: string
  storeId?: string
  status?: PaymentStatus
}

export interface PaymentContractSummary {
  contractId: string
  contractAmount: number
  totalCollected: number
  totalRefunded: number
  balance: number
}
