import { http } from '../client'
import type {
  AdjustCustomerAccountDto,
  ConsumeCustomerAccountDto,
  CustomerAccount,
  CustomerAccountTransaction,
  RechargeCustomerAccountDto,
  RefundCustomerAccountDto,
} from '../types/finance'

export const customerAccountApi = {
  getByCustomer: (customerId: string) => http.get<CustomerAccount>(`/finance/customer-accounts/${customerId}`).then((r) => r.data),
  listTransactions: (customerId: string) => http.get<CustomerAccountTransaction[]>(`/finance/customer-accounts/${customerId}/transactions`).then((r) => r.data),
  recharge: (body: RechargeCustomerAccountDto) => http.post<CustomerAccount>('/finance/customer-accounts/recharge', body).then((r) => r.data),
  consume: (body: ConsumeCustomerAccountDto) => http.post<CustomerAccount>('/finance/customer-accounts/consume', body).then((r) => r.data),
  refund: (body: RefundCustomerAccountDto) => http.post<CustomerAccount>('/finance/customer-accounts/refund', body).then((r) => r.data),
  adjust: (body: AdjustCustomerAccountDto) => http.post<CustomerAccount>('/finance/customer-accounts/adjust', body).then((r) => r.data),
}
