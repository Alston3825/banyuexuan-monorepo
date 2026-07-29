import type { CommonStatus, ScopedEntityBase } from './common'

export interface KnowledgeDocument extends ScopedEntityBase {
  title: string
  content: string
  category: string | null
  status: CommonStatus
}

export interface CreateKnowledgeDocumentDto {
  title: string
  content: string
  category?: string
}

export interface UpdateKnowledgeDocumentDto {
  title?: string
  content?: string
  category?: string
  status?: CommonStatus
  version: number
}
