import type { CommonStatus, ScopedEntityBase } from './common'

export interface Position extends ScopedEntityBase {
  code: string
  name: string
  rank: number | null
  status: CommonStatus
}

export interface CreatePositionDto {
  code?: string
  name: string
  rank?: number
}

export interface UpdatePositionDto {
  name?: string
  status?: CommonStatus
  version: number
}
