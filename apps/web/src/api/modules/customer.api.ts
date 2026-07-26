import { http } from '../client'
import type { Customer, CreateCustomerDto, UpdateCustomerDto, QueryCustomerParams } from '../types/customer'

export const customerApi = {
  list: (params?: QueryCustomerParams) => http.get<Customer[]>('/crm/customers', { params }).then((r) => r.data),
  get: (id: string) => http.get<Customer>(`/crm/customers/${id}`).then((r) => r.data),
  create: (body: CreateCustomerDto) => http.post<Customer>('/crm/customers', body).then((r) => r.data),
  update: (id: string, body: UpdateCustomerDto) =>
    http.patch<Customer>(`/crm/customers/${id}`, body).then((r) => r.data),
}
