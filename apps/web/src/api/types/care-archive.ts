/** 护理档案：纸质资料留档 + 四张单次评估表 */

export type AssessmentType = 'MOTHER_ADMISSION' | 'BABY_ADMISSION' | 'MOTHER_DISCHARGE' | 'BABY_DISCHARGE'

export type FieldKind = 'text' | 'longtext' | 'int' | 'decimal' | 'date' | 'single' | 'multi'

export interface FieldOption {
  value: string
  label: string
}

/** 字段说明书（后端 assessment-specs.ts 的镜像，页面按它自动生成表单） */
export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  options?: FieldOption[]
  unit?: string
  min?: number
  max?: number
  hint?: string
}

export interface GroupSpec {
  title: string
  fields: FieldSpec[]
}

export interface FormSpec {
  type: AssessmentType
  title: string
  subject: 'MOTHER' | 'BABY'
  groups: GroupSpec[]
}

export type CareDocType =
  | AssessmentType
  | 'DAILY_RECORD'
  | 'MEDICATION_AUTH'
  | 'CARE_PLAN'
  | 'RISK_NOTICE'
  | 'ORIENTATION'
  | 'CHOKING_PROTOCOL'
  | 'OTHER'

export interface CareDocumentFile {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sortOrder: number
}

export type ExtractStatus = 'NONE' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'

export interface ExtractWarning {
  field: string
  level: 'info' | 'warn' | 'missing'
  message: string
}

export interface CareDocument {
  id: string
  docType: CareDocType
  motherProfileId: string
  babyProfileId: string | null
  status: 'DRAFT' | 'CONFIRMED'
  title: string | null
  docDate: string | null
  remark: string | null
  extractStatus: ExtractStatus
  extractError: string | null
  extractData: Record<string, unknown> | null
  extractWarnings: ExtractWarning[] | null
  extractScope?: string | null
  extractedAt: string | null
  createdAt: string
  version: number
  files: CareDocumentFile[]
}

/** 评估表记录：除了公共列，其余键就是字段说明书里的 key */
export interface AssessmentRecord {
  id: string
  version: number
  documentId: string | null
  document?: { id: string; status: string; files: { id: string; fileName: string; mimeType: string }[] } | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface AssessmentOverview {
  motherProfileId: string
  motherAdmission: AssessmentRecord | null
  motherDischarge: AssessmentRecord | null
  babies: {
    baby: { id: string; sequenceNo: number; name: string | null; gender: string; birthDate: string | null }
    admission: AssessmentRecord | null
    discharge: AssessmentRecord | null
  }[]
}

/** 只留档（不做结构化）的资料类型，前端“资料留档”里让用户选 */
export const ARCHIVE_ONLY_TYPES: { value: CareDocType; label: string }[] = [
  { value: 'RISK_NOTICE', label: '产妇及新生儿风险告知书' },
  { value: 'ORIENTATION', label: '会所入住宣教' },
  { value: 'CHOKING_PROTOCOL', label: '新生儿呛奶应急预案及处理方法' },
  { value: 'OTHER', label: '其他资料' },
]

export const CARE_DOC_TYPE_LABEL: Record<CareDocType, string> = {
  MOTHER_ADMISSION: '产妇入住评估单',
  BABY_ADMISSION: '新生儿入所评估',
  MOTHER_DISCHARGE: '妈妈出所健康评估表',
  BABY_DISCHARGE: '宝宝出所健康评估表',
  DAILY_RECORD: '新生儿和产妇日常护理记录',
  MEDICATION_AUTH: '新生儿用药服药喂药委托书',
  CARE_PLAN: '护理计划',
  RISK_NOTICE: '产妇及新生儿风险告知书',
  ORIENTATION: '会所入住宣教',
  CHOKING_PROTOCOL: '新生儿呛奶应急预案及处理方法',
  OTHER: '其他资料',
}

// ---------------- 日常护理记录 ----------------

export interface DailySpecs {
  mother: GroupSpec[]
  baby: GroupSpec[]
  feeding: FieldSpec[]
}

export interface DailyDayRow {
  date: string
  stayDay: number
  filled: boolean
  babiesFilled: number
}

export interface DailyDays {
  motherProfileId: string
  roomNo: string | null
  startDate: string
  today: string
  babyCount: number
  days: DailyDayRow[]
}

export interface FeedingEntry {
  [key: string]: unknown
}

export interface DailySummary {
  formulaTotalMl: number
  breastMilkTotalMl: number
  waterTotalMl: number
  urineCount: number
  stoolCount: number
  feedCount: number
}

export interface DailyDay {
  motherProfileId: string
  date: string
  roomNo: string | null
  defaults: { stayDay: number }
  record: ({ id: string; version: number; stayDay: number | null; documentId: string | null } & Record<string, unknown>) | null
  babies: {
    baby: { id: string; sequenceNo: number; name: string | null; gender: string; birthDate: string | null }
    defaultAgeDays: number | null
    record: ({ id: string; version: number } & Record<string, unknown>) | null
    feedings: FeedingEntry[]
    summary: DailySummary
    /** 这一天仍有效的用药委托（日常记录“用药”栏选药/核对用） */
    activeMedications: ActiveMedication[]
  }[]
}

export interface SaveDayBody {
  motherProfileId: string
  date: string
  documentId?: string | null
  version?: number
  mother: Record<string, unknown>
  babies: { babyProfileId: string; values: Record<string, unknown>; feedings: FeedingEntry[] }[]
}

// ---------------- 用药委托书 ----------------

export interface MedicationSpecs {
  header: FieldSpec[]
  item: FieldSpec[]
}

export interface MedicationItem {
  id?: string
  drugName: string
  route?: string | null
  times?: string[] | null
  dose?: string | null
  courseDays?: number | null
  startDate?: string | null
  endDate?: string | null
  notes?: string | null
  familySigned?: string | null
  [key: string]: unknown
}

export type MedicationStatus = 'ACTIVE' | 'SUPERSEDED' | 'STOPPED'

export interface MedicationAuth {
  id: string
  version: number
  status: MedicationStatus
  babyProfileId: string
  motherProfileId: string
  previousAuthId: string | null
  authDate: string | null
  medicationStart: string | null
  signerName: string | null
  nurseName: string | null
  changeNote: string | null
  remark: string | null
  stoppedAt: string | null
  stopNote: string | null
  documentId: string | null
  createdAt: string
  items: MedicationItem[]
  document: { id: string; status: string; files: { id: string; fileName: string; mimeType: string }[] } | null
  babyProfile: { id: string; sequenceNo: number; name: string | null; gender: string }
}

export interface MedicationBody {
  motherProfileId?: string
  babyProfileId?: string
  previousAuthId?: string
  changeNote?: string
  documentId?: string | null
  version?: number
  header: Record<string, unknown>
  items: MedicationItem[]
}

export const MED_ROUTE_LABEL: Record<string, string> = { ORAL: '内服', EXTERNAL: '外用' }
export const MED_TIME_LABEL: Record<string, string> = { MORNING: '早', NOON: '中', EVENING: '晚' }
export const MED_STATUS_LABEL: Record<MedicationStatus, string> = { ACTIVE: '有效', SUPERSEDED: '已替换', STOPPED: '已停药' }

export interface ActiveMedication {
  authId: string
  drugName: string
  route: string | null
  times: string[] | null
  dose: string | null
}

// ---------------- 个人化护理计划 / 服务执行 / 统计 / 出所小结 ----------------

export type CareLevelCode = 'LEVEL1' | 'LEVEL2' | 'LEVEL3'
export const CARE_LEVEL_LABEL: Record<CareLevelCode, string> = { LEVEL1: '一级（重点）', LEVEL2: '二级', LEVEL3: '三级（常规）' }
export type PlanStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED'
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { DRAFT: '编辑中', PENDING_REVIEW: '待护理主任审核', ACTIVE: '生效中', SUPERSEDED: '已替换', REJECTED: '被驳回' }
export type PlanSource = 'INITIAL' | 'REGULAR_REVIEW' | 'DIRECTOR_ROUND'
export const PLAN_SOURCE_LABEL: Record<PlanSource, string> = { INITIAL: '入所首次制定', REGULAR_REVIEW: '7 天定期评审', DIRECTOR_ROUND: '护理主任查房调整' }

export interface PlanMeasure {
  title: string
  content: string
  frequency: string
}

export interface PlanVersion {
  id: string
  version: number
  motherProfileId: string
  babyProfileId: string | null
  versionNo: number
  status: PlanStatus
  level: CareLevelCode
  source: PlanSource
  assessmentSummary: string | null
  focusPoints: string | null
  measures: PlanMeasure[] | null
  progressNote: string | null
  adjustReason: string | null
  createdByName: string | null
  submittedAt: string | null
  reviewerName: string | null
  reviewedAt: string | null
  reviewComment: string | null
  effectiveAt: string | null
  nextReviewDue: string | null
  endedAt: string | null
  createdAt: string
}

export interface PlanBody {
  motherProfileId?: string
  babyProfileId?: string | null
  level?: CareLevelCode
  source?: PlanSource
  assessmentSummary?: string | null
  focusPoints?: string | null
  measures?: PlanMeasure[]
  progressNote?: string | null
  adjustReason?: string | null
  directActivate?: boolean
  version?: number
}

export interface ServiceRow {
  code: string
  name: string
  subject: 'MOTHER' | 'BABY'
  group: 'ITEM' | 'EDU'
  level: CareLevelCode
  babyProfileId: string | null
  babyLabel: string | null
  freqText: string
  expected: number | null
  done: number
  /** 需要记录数值的项目：BP=血压，WEIGHT=体重；其余只记日期和时间 */
  measure: 'BP' | 'WEIGHT' | null
  logs: {
    id: string
    date: string
    time: string | null
    systolic: number | null
    diastolic: number | null
    weightKg: number | null
    doneByName: string | null
    clientSigned: boolean
    note: string | null
  }[]
}

export interface ServiceSummary {
  motherProfileId: string
  stayDay: number
  startDate: string
  motherLevel: CareLevelCode
  rows: ServiceRow[]
}

export interface StatMetric {
  code: string
  label: string
  subject: 'BABY' | 'MOTHER'
  unit: string
  presets: { label: string; op: string; value: number }[]
}

export interface StatRow {
  date: string
  motherProfileId: string
  roomNo: string | null
  customerName: string
  babyName: string | null
  value: number
}

export interface CareSummary {
  motherProfileId: string
  customerName: string
  roomNo: string | null
  stay: { start: string | null; end: string | null; days: number | null }
  delivery: { method: string; date: string | null; weeks: number | null }
  mother: {
    admission: { weightKg: number | null; bp: string | null; temperature: number | null; handlingNotes: string | null } | null
    discharge: { weightKg: number | null; bp: string | null; temperature: number | null; fundus: string | null; lochiaAmount: string | null; otherSpecial: string | null; tips: string | null } | null
    daily: { recordedDays: number; avgTemperature: number | null; maxSystolic: number | null; maxDiastolic: number | null }
  }
  babies: {
    id: string
    label: string
    gender: string
    birthDate: string | null
    admission: { weightG: number | null; lengthCm: number | null; headCm: number | null; jaundice: number | null; feeding: string | null } | null
    discharge: { weightKg: number | null; lengthCm: number | null; headCm: number | null; jaundice: number | null; tips: string | null } | null
    daily: {
      recordedDays: number
      jaundiceMax: number | null
      jaundiceTrend: { date: string; v: number }[]
      weightTrend: { date: string; v: number }[]
      avgFormulaMlPerDay: number | null
      avgUrinePerDay: number | null
      avgStoolPerDay: number | null
    }
    medications: { status: string; authDate: string | null; items: string[]; changeNote: string | null; stopNote: string | null }[]
    plans: { versionNo: number; level: string; status: string; source: string; effectiveAt: string | null; focusPoints: string | null }[]
  }[]
  motherPlans: { versionNo: number; level: string; status: string; source: string; effectiveAt: string | null; reviewerName: string | null; focusPoints: string | null; progressNote: string | null; adjustReason: string | null }[]
  serviceLogCounts: Record<string, number>
  abnormalityCount: number
  generatedAt: string
}
