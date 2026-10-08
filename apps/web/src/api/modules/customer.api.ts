import { http } from '../client'
import type {
  Customer,
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomerParams,
  CustomerTagBinding,
  IdCardCheck,
  ReferrerSearchResult,
  StaffOption,
  RemovalCheck,
} from '../types/customer'

export const customerApi = {
  list: (params?: QueryCustomerParams) => http.get<Customer[]>('/crm/customers', { params }).then((r) => r.data),
  get: (id: string) => http.get<Customer>(`/crm/customers/${id}`).then((r) => r.data),
  create: (body: CreateCustomerDto) => http.post<Customer>('/crm/customers', body).then((r) => r.data),
  update: (id: string, body: UpdateCustomerDto) =>
    http.patch<Customer>(`/crm/customers/${id}`, body).then((r) => r.data),
  // 新建/编辑客户页的选择器数据：不依赖 platform.account 权限，店员也能选
  /** salesOnly=true 只返回销售部员工 */
  staffOptions: (keyword?: string, salesOnly?: boolean) =>
    http.get<StaffOption[]>('/crm/customers/staff-options', { params: { keyword, salesOnly: salesOnly ? 1 : undefined } }).then((r) => r.data),
  referrerSearch: (keyword: string) =>
    http.get<ReferrerSearchResult>('/crm/customers/referrer-search', { params: { keyword } }).then((r) => r.data),
  idCardCheck: (idCardNo: string) => http.get<IdCardCheck>('/crm/customers/id-card-check', { params: { idCardNo } }).then((r) => r.data),
  // 客户分类(A-E)/客户类型(鹰派萌派等)标签：见后端 CustomerController 的 tags 系列接口，
  // 挂在客户模块下用 crm.customer.* 权限，不是 platform.tag.*。
  // tagCatalog 同理——查标签目录选项也不要求 platform.tag.view，销售/店长才能选得到标签。
  /** 删除/归档前的检查：有哪些数据、能不能删、有没有删除权限 */
  deleteCheck: (id: string) => http.get<RemovalCheck>(`/crm/customers/${id}/delete-check`).then((r) => r.data),
  remove: (id: string, confirmName?: string) => http.delete(`/crm/customers/${id}`, { params: confirmName ? { confirmName } : undefined }).then(() => undefined),
  archive: (id: string, reason?: string) => http.post(`/crm/customers/${id}/archive`, { reason }).then(() => undefined),
  restore: (id: string) => http.post(`/crm/customers/${id}/restore`).then(() => undefined),
  tagCatalog: (category: string) =>
    http.get<{ id: string; name: string; category: string | null; color: string | null }[]>('/crm/customers/tag-catalog', { params: { category } }).then((r) => r.data),
  listTags: (id: string) => http.get<CustomerTagBinding[]>(`/crm/customers/${id}/tags`).then((r) => r.data),
  listTagHistory: (id: string, category?: string) =>
    http.get<CustomerTagBinding[]>(`/crm/customers/${id}/tags/history`, { params: { category } }).then((r) => r.data),
  setTag: (id: string, category: string, tagId: string) =>
    http.post<CustomerTagBinding>(`/crm/customers/${id}/tags`, { category, tagId }).then((r) => r.data),
  unbindTag: (id: string, bindingId: string) => http.delete(`/crm/customers/${id}/tags/${bindingId}`).then((r) => r.data),
}
