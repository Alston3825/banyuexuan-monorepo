import type { CommonStatus } from './common'

export type ApplicationType = 'WEB' | 'MOBILE' | 'OPENAPI'

export interface Application {
  id: string
  tenantId: string | null
  code: string
  name: string
  type: ApplicationType
  status: CommonStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateApplicationDto {
  code: string
  name: string
  type: ApplicationType
}

export interface UpdateApplicationDto {
  name?: string
  status?: CommonStatus
  version: number
}
