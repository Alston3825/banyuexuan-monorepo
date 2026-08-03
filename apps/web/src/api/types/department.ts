import type { CommonStatus, ScopedEntityBase } from './common'

export interface Department extends ScopedEntityBase {
  storeId: string | null
  parentId: string | null
  code: string
  name: string
  status: CommonStatus
}

export interface CreateDepartmentDto {
  code?: string
  name: string
  storeId?: string
  parentId?: string
}

export interface UpdateDepartmentDto {
  name?: string
  status?: CommonStatus
  version: number
}
