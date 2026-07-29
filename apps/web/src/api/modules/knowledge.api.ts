import { http } from '../client'
import type { CreateKnowledgeDocumentDto, KnowledgeDocument, UpdateKnowledgeDocumentDto } from '../types/knowledge'

export const knowledgeDocumentApi = {
  list: () => http.get<KnowledgeDocument[]>('/ai/knowledge-documents').then((r) => r.data),
  get: (id: string) => http.get<KnowledgeDocument>(`/ai/knowledge-documents/${id}`).then((r) => r.data),
  create: (body: CreateKnowledgeDocumentDto) => http.post<KnowledgeDocument>('/ai/knowledge-documents', body).then((r) => r.data),
  update: (id: string, body: UpdateKnowledgeDocumentDto) => http.patch<KnowledgeDocument>(`/ai/knowledge-documents/${id}`, body).then((r) => r.data),
  delete: (id: string) => http.delete(`/ai/knowledge-documents/${id}`).then((r) => r.data),
}
