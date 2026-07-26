import { http } from '../client'
import type { WorkflowDefinition } from '../types/workflow'

export const workflowDefinitionApi = {
  list: () => http.get<WorkflowDefinition[]>('/workflow/definitions').then((r) => r.data),
}
