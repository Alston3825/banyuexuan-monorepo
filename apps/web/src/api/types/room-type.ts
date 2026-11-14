import type { ScopedEntityBase } from './common'

export interface RoomType extends ScopedEntityBase {
  code: string
  name: string
  description: string | null
  standardPrice: number | null
  status: 'ACTIVE' | 'INACTIVE'
}

export interface CreateRoomTypeDto {
  code: string
  name: string
  description?: string
  standardPrice?: number
}

export interface UpdateRoomTypeDto {
  name?: string
  description?: string
  standardPrice?: number
  status?: 'ACTIVE' | 'INACTIVE'
  version: number
}
