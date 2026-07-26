import type { CommonStatus, ScopedEntityBase } from './common'

export interface Region extends ScopedEntityBase {
  code: string
  name: string
  status: CommonStatus
}

export interface CreateRegionDto {
  code: string
  name: string
}

export interface UpdateRegionDto {
  name?: string
  status?: CommonStatus
  version: number
}
