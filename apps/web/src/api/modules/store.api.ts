import { http } from '../client'
import type { CreateStoreDto, Store, UpdateStoreDto } from '../types/store'

export const storeApi = {
  list: () => http.get<Store[]>('/platform/stores').then((r) => r.data),
  get: (id: string) => http.get<Store>(`/platform/stores/${id}`).then((r) => r.data),
  create: (body: CreateStoreDto) => http.post<Store>('/platform/stores', body).then((r) => r.data),
  update: (id: string, body: UpdateStoreDto) => http.patch<Store>(`/platform/stores/${id}`, body).then((r) => r.data),
  /** 语义上是"关闭门店"（转 CLOSED），不是物理删除。 */
  close: (id: string, version: number) =>
    http.delete<Store>(`/platform/stores/${id}`, { data: { version } }).then((r) => r.data),
}
