import type { CommonStatus, ScopedEntityBase } from './common'

export interface Team extends ScopedEntityBase {
  storeId: string | null
  departmentId: string
  code: string
  name: string
  status: CommonStatus
}

export interface CreateTeamDto {
  code: string
  name: string
  departmentId: string
}

export interface UpdateTeamDto {
  name?: string
  status?: CommonStatus
  version: number
}
