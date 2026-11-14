import { http } from '../client'
import type { Payment, CreatePaymentDto, QueryPaymentParams, PaymentContractSummary } from '../types/payment'

export const paymentApi = {
  list: (params?: QueryPaymentParams) => http.get<Payment[]>('/payment/records', { params }).then((r) => r.data),
  get: (id: string) => http.get<Payment>(`/payment/records/${id}`).then((r) => r.data),
  create: (body: CreatePaymentDto) => http.post<Payment>('/payment/records', body).then((r) => r.data),
  requestRefund: (id: string, refundReason: string, version: number) =>
    http.post<Payment>(`/payment/records/${id}/refund`, { refundReason, version }).then((r) => r.data),
  getSummary: (contractId: string) =>
    http.get<PaymentContractSummary>('/payment/records/summary', { params: { contractId } }).then((r) => r.data),
}
