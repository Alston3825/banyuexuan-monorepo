export type CommonStatus = 'ACTIVE' | 'INACTIVE'

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface ScopedEntityBase {
  id: string
  tenantId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
}
