import type { ScopedEntityBase } from './common'

export type StoreStatus = 'PENDING' | 'ACTIVE' | 'CLOSED'

export interface Store extends ScopedEntityBase {
  regionId: string
  code: string
  name: string
  address: string | null
  status: StoreStatus
}

export interface CreateStoreDto {
  code: string
  name: string
  regionId: string
  address?: string
}

export interface UpdateStoreDto {
  name?: string
  address?: string
  status?: StoreStatus
  version: number
}
