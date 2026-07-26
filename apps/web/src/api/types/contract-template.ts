import type { ScopedEntityBase } from './common'
import type { CommonStatus } from './common'

export interface ContractTemplate extends ScopedEntityBase {
  code: string
  name: string
  content: string
  status: CommonStatus
}

export interface CreateContractTemplateDto {
  code: string
  name: string
  content: string
}

export interface UpdateContractTemplateDto {
  name?: string
  content?: string
  status?: CommonStatus
  version: number
}
