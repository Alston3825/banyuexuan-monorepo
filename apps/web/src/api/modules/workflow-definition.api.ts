import { http } from '../client'
import type { SaveDefinitionDto, SettingsDefinition, WorkflowDefinition } from '../types/workflow'

export const workflowDefinitionApi = {
  list: () => http.get<WorkflowDefinition[]>('/workflow/definitions').then((r) => r.data),
  /** 审批流程设置页：每类单据当前的流程 */
  settings: () => http.get<SettingsDefinition[]>('/workflow/definitions/settings').then((r) => r.data),
  save: (code: string, body: SaveDefinitionDto) => http.put<SettingsDefinition>(`/workflow/definitions/${code}`, body).then((r) => r.data),
}
