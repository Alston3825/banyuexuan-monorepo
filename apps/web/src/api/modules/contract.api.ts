import { http } from '../client'
import type {
  ContractDetail,
  ContractListItem,
  CustomerMatch,
  QueryContractParams,
  UpdateContractDto,
} from '../types/contract'

export const contractApi = {
  list: (params?: QueryContractParams) => http.get<ContractListItem[]>('/contract/records', { params }).then((r) => r.data),
  get: (id: string) => http.get<ContractDetail>(`/contract/records/${id}`).then((r) => r.data),
  /** 上传纸质合同（一个 PDF，或同一份合同的多张照片），AI 在后台识别。 */
  upload: (files: File[], storeId?: string) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (storeId) form.append('storeId', storeId)
    return http.post<ContractDetail>('/contract/records/upload', form, { timeout: 120_000 }).then((r) => r.data)
  },
  createManual: (storeId?: string) => http.post<ContractDetail>('/contract/records/manual', { storeId }).then((r) => r.data),
  update: (id: string, body: UpdateContractDto) => http.patch<ContractDetail>(`/contract/records/${id}`, body).then((r) => r.data),
  reextract: (id: string) => http.post<ContractDetail>(`/contract/records/${id}/reextract`).then((r) => r.data),
  customerMatches: (id: string) =>
    http.get<{ matches: CustomerMatch[]; suggestedId: string | null }>(`/contract/records/${id}/customer-matches`).then((r) => r.data),
  confirm: (id: string, version: number, customerId?: string) =>
    http.post<ContractDetail>(`/contract/records/${id}/confirm`, { version, customerId }).then((r) => r.data),
  void: (id: string, voidReason: string, version: number) =>
    http.post<ContractDetail>(`/contract/records/${id}/void`, { voidReason, version }).then((r) => r.data),
  remove: (id: string) => http.delete<{ success: boolean }>(`/contract/records/${id}`).then((r) => r.data),
  /** 原件/页面图片需要带登录令牌，所以先当二进制取回来，页面里用 URL.createObjectURL 显示。 */
  fileBlob: (id: string, fileId: string) =>
    http.get<Blob>(`/contract/records/${id}/files/${fileId}`, { responseType: 'blob' }).then((r) => r.data),
}
