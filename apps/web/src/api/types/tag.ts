import type { ScopedEntityBase } from './common'

export interface Tag extends ScopedEntityBase {
  name: string
  color: string | null
  category: string | null
}

export interface CreateTagDto {
  name: string
  color?: string
  category?: string
}

export interface UpdateTagDto {
  name?: string
  color?: string
  category?: string
  version: number
}

export interface BindTagDto {
  entityType: string
  entityId: string
}
