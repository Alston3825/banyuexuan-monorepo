import { http } from '../client'
import type { ContractTemplate, CreateContractTemplateDto, UpdateContractTemplateDto } from '../types/contract-template'

export const contractTemplateApi = {
  list: () => http.get<ContractTemplate[]>('/contract/templates').then((r) => r.data),
  get: (id: string) => http.get<ContractTemplate>(`/contract/templates/${id}`).then((r) => r.data),
  create: (body: CreateContractTemplateDto) =>
    http.post<ContractTemplate>('/contract/templates', body).then((r) => r.data),
  update: (id: string, body: UpdateContractTemplateDto) =>
    http.patch<ContractTemplate>(`/contract/templates/${id}`, body).then((r) => r.data),
}
