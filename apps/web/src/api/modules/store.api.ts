import { AxiosError } from 'axios'
import { http } from '../client'
import type { CreateStoreDto, Store, UpdateStoreDto } from '../types/store'

export const storeApi = {
  // 大量业务页面（合同/客户/库存等）用这个接口只是为了填一个"建档门店"下拉选项，
  // 不是真的要管理门店——没有 platform.store 权限的账号（比如普通员工角色）打这个
  // 接口会拿到403，属于预期内的正常降级，不该弹一个吓人的错误提示，直接给空列表即可，
  // 对应的下拉框自然就是空的。真正的门店管理页(/org/stores)本身在路由守卫那一层就已经
  // 挡住了没有platform.store权限的账号进入，不会依赖这里的静默降级来保护数据。
  list: () =>
    http
      .get<Store[]>('/platform/stores', { silent403: true } as any)
      .then((r) => r.data)
      .catch((err: AxiosError) => (err.response?.status === 403 ? [] : Promise.reject(err))),
  get: (id: string) => http.get<Store>(`/platform/stores/${id}`).then((r) => r.data),
  create: (body: CreateStoreDto) => http.post<Store>('/platform/stores', body).then((r) => r.data),
  update: (id: string, body: UpdateStoreDto) => http.patch<Store>(`/platform/stores/${id}`, body).then((r) => r.data),
  /** 语义上是"关闭门店"（转 CLOSED），不是物理删除。 */
  close: (id: string, version: number) =>
    http.delete<Store>(`/platform/stores/${id}`, { data: { version } }).then((r) => r.data),
}
