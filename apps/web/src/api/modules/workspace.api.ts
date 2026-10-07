import { http } from '../client'
import type { TodoSummary } from '../types/workflow'

export const workspaceApi = {
  todos: () => http.get<TodoSummary>('/workspace/todos').then((r) => r.data),
  badge: () => http.get<{ total: number; overdue: number }>('/workspace/todos/badge', { silent403: true } as any).then((r) => r.data),
}
