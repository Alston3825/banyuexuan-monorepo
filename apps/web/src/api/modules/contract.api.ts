import { http } from '../client'
import type { Contract, CreateContractDto, UpdateContractDto, RenewContractDto, QueryContractParams } from '../types/contract'

export const contractApi = {
  list: (params?: QueryContractParams) => http.get<Contract[]>('/contract/records', { params }).then((r) => r.data),
  get: (id: string) => http.get<Contract>(`/contract/records/${id}`).then((r) => r.data),
  create: (body: CreateContractDto) => http.post<Contract>('/contract/records', body).then((r) => r.data),
  update: (id: string, body: UpdateContractDto) =>
    http.patch<Contract>(`/contract/records/${id}`, body).then((r) => r.data),
  sign: (id: string, version: number) =>
    http.post<Contract>(`/contract/records/${id}/sign`, { version }).then((r) => r.data),
  submit: (id: string, version: number) =>
    http.post<Contract>(`/contract/records/${id}/submit`, { version }).then((r) => r.data),
  void: (id: string, voidReason: string, version: number) =>
    http.post<Contract>(`/contract/records/${id}/void`, { voidReason, version }).then((r) => r.data),
  renew: (id: string, body: RenewContractDto) =>
    http.post<Contract>(`/contract/records/${id}/renew`, body).then((r) => r.data),
}
