export interface SurveyItemSpec {
  key: string
  label: string
}
export interface SurveyGroupSpec {
  key: string
  title: string
  items: SurveyItemSpec[]
}
export interface SurveyFormSpec {
  id: string
  name: string
  sortNo: number
  /** 入住第几天做；空 = 不自动提醒 */
  day: number | null
  status: 'ACTIVE' | 'INACTIVE'
  goodWord: string
  badWord: string
  groups: SurveyGroupSpec[]
  suggestionLabel: string
  praiseLabel: string
}
export interface SurveySpecs {
  templates: SurveyFormSpec[]
  scoreMax: number
  satisfiedMin: number
  unsatisfiedMax: number
}

export type ExtractStatus = 'NONE' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'

export interface SurveyFile {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sortOrder: number
}
export interface Survey {
  id: string
  storeId: string | null
  formNo: number
  templateId: string | null
  customerId: string | null
  customer?: { id: string; name: string; phone: string } | null
  customerName: string | null
  roomNo: string | null
  stewardName: string | null
  nurseName: string | null
  phone: string | null
  surveyDate: string | null
  scores: Record<string, number> | null
  suggestion: string | null
  praise: string | null
  status: 'DRAFT' | 'CONFIRMED'
  extractStatus: ExtractStatus
  extractError: string | null
  extractWarnings: { field: string; level: string; message: string }[] | null
  extractModel: string | null
  confirmedAt: string | null
  createdAt: string
  files: SurveyFile[]
}
export interface SurveyPatch {
  customerId?: string | null
  customerName?: string | null
  roomNo?: string | null
  stewardName?: string | null
  nurseName?: string | null
  phone?: string | null
  surveyDate?: string | null
  scores?: Record<string, number | null>
  suggestion?: string | null
  praise?: string | null
}
export interface SurveyFilter {
  templateId?: string
  from?: string
  to?: string
  steward?: string
  status?: string
  keyword?: string
}
export interface SurveyItemStat {
  key: string
  label: string
  count: number
  avg: number | null
  good: number
  mid: number
  bad: number
  /** 下标 = 分值 0~12 */
  histogram: number[]
}
export interface SurveyStats {
  total: number
  pending: number
  scoreMax: number
  forms: {
    templateId: string
    title: string
    day: number | null
    count: number
    avg: number | null
    satisfiedRate: number | null
    groups: { key: string; title: string; avg: number | null; items: SurveyItemStat[] }[]
  }[]
  lowItems: { templateId: string; formTitle: string; groupTitle: string; key: string; label: string; avg: number; count: number; bad: number }[]
  trend: { month: string; templateId: string; avg: number }[]
  staff: { name: string; surveys: number; avg: number }[]
}
export interface SurveyComment {
  id: string
  formNo: number
  templateId: string | null
  customerName: string | null
  roomNo: string | null
  stewardName: string | null
  surveyDate: string | null
  suggestion: string | null
  praise: string | null
}

export interface SurveyTemplate extends SurveyFormSpec {
  source: 'BUILTIN' | 'MANUAL' | 'UPLOAD'
  version: number
  surveyCount: number
  itemCount: number
}
export interface SurveyTemplateInput {
  name?: string
  day?: number | null
  goodWord?: string
  badWord?: string
  suggestionLabel?: string
  praiseLabel?: string
  groups?: { key?: string; title: string; items: { key?: string; label: string }[] }[]
  status?: 'ACTIVE' | 'INACTIVE'
  version?: number
}
