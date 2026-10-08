import type { ScopedEntityBase } from './common'

export type CareTargetType = 'MOTHER' | 'BABY'
export type CareFieldControlType = 'NUMBER' | 'TEXT' | 'TEXTAREA' | 'SELECT' | 'RADIO'
export type CareFormDepartment = 'NURSING' | 'POSTPARTUM_RECOVERY' | 'MEAL' | 'CUSTOMER_SERVICE' | 'MEDICAL'
export type CareFormScene = 'GENERAL' | 'IN_HOUSE' | 'HOME_VISIT' | 'HOSPITAL'
export type DeliveryMethod = 'VAGINAL' | 'CESAREAN' | 'UNKNOWN'
export type BabyGender = 'MALE' | 'FEMALE' | 'UNKNOWN'
export type CarePlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED'
export type CarePlanTaskStatus = 'PENDING' | 'COMPLETED' | 'MISSED'
export type CareAbnormalityStatus = 'OPEN' | 'FOLLOWING' | 'RESOLVED' | 'IGNORED'

export interface CareFieldOption {
  value: string
  label: string
}

export interface CareFieldDefinition extends ScopedEntityBase {
  code: string
  name: string
  targetType: CareTargetType
  controlType: CareFieldControlType
  unit: string | null
  options: CareFieldOption[] | null
  normalMin: number | null
  normalMax: number | null
  normalOptionValues: string[] | null
  visibleToClient: boolean
  status: 'ACTIVE' | 'INACTIVE'
}

export interface CreateCareFieldDefinitionDto {
  code: string
  name: string
  targetType: CareTargetType
  controlType: CareFieldControlType
  unit?: string
  options?: CareFieldOption[]
  normalMin?: number
  normalMax?: number
  normalOptionValues?: string[]
  visibleToClient?: boolean
}

export interface UpdateCareFieldDefinitionDto {
  name?: string
  unit?: string
  options?: CareFieldOption[]
  normalMin?: number
  normalMax?: number
  normalOptionValues?: string[]
  visibleToClient?: boolean
  status?: 'ACTIVE' | 'INACTIVE'
  version: number
}

export interface CareFormTemplateFieldInput {
  fieldId: string
  required?: boolean
  sortOrder?: number
}

export interface CareFormTemplateField {
  id: string
  formTemplateId: string
  fieldId: string
  sortOrder: number
  required: boolean
  field: CareFieldDefinition
}

export interface CareFormTemplate extends ScopedEntityBase {
  code: string
  name: string
  targetType: CareTargetType
  department: CareFormDepartment
  scene: CareFormScene
  status: 'ACTIVE' | 'INACTIVE'
  fields: CareFormTemplateField[]
}

export interface CreateCareFormTemplateDto {
  code: string
  name: string
  targetType: CareTargetType
  department: CareFormDepartment
  scene?: CareFormScene
  fields: CareFormTemplateFieldInput[]
}

export interface UpdateCareFormTemplateDto {
  name?: string
  scene?: CareFormScene
  status?: 'ACTIVE' | 'INACTIVE'
  fields?: CareFormTemplateFieldInput[]
  version: number
}

export interface CarePlanTemplateItemInput {
  dayOffset: number
  formTemplateId: string
}

export interface CarePlanTemplateItem {
  id: string
  planTemplateId: string
  dayOffset: number
  formTemplateId: string
  formTemplate: CareFormTemplate
}

export interface CarePlanTemplate extends ScopedEntityBase {
  code: string
  name: string
  targetType: CareTargetType
  totalDays: number
  status: 'ACTIVE' | 'INACTIVE'
  items: CarePlanTemplateItem[]
}

export interface CreateCarePlanTemplateDto {
  code: string
  name: string
  targetType: CareTargetType
  totalDays: number
  items: CarePlanTemplateItemInput[]
}

export interface UpdateCarePlanTemplateDto {
  name?: string
  status?: 'ACTIVE' | 'INACTIVE'
  items?: CarePlanTemplateItemInput[]
  version: number
}

export interface TagBinding {
  id: string
  tagId: string
  entityType: string
  entityId: string
  tag: { id: string; name: string; color: string | null; category: string | null }
}

export interface BabyProfile extends ScopedEntityBase {
  storeId: string
  customerId: string
  motherProfileId: string
  sequenceNo: number
  name: string | null
  gender: BabyGender
  birthDate: string | null
  birthWeightGrams: number | null
  apgarScore: string | null
  remark: string | null
}

export interface BabyProfileInput {
  name?: string
  gender?: BabyGender
  birthDate?: string
  birthWeightGrams?: number
  apgarScore?: string
  remark?: string
  riskTagIds?: string[]
}

export interface CreateBabyProfileDto extends BabyProfileInput {
  motherProfileId: string
}

export interface UpdateBabyProfileDto {
  name?: string
  gender?: BabyGender
  birthDate?: string
  birthWeightGrams?: number
  apgarScore?: string
  remark?: string
  version: number
}

export interface MotherProfile extends ScopedEntityBase {
  archivedAt?: string | null
  storeId: string
  customerId: string
  occupancyId: string | null
  deliveryMethod: DeliveryMethod
  deliveryDate: string | null
  gestationalWeeks: number | null
  expectedDeliveryDate: string | null
  /** 护理要点/医嘱：护理看板卡片上展示的简短提示，与 remark（建档备注）分开维护 */
  careNote: string | null
  /** 主责护理师（员工账号） */
  primaryNurseId: string | null
  primaryNurse?: { id: string; realName: string } | null
  remark: string | null
  babies: BabyProfile[]
  /** 列表接口附带：客户姓名/手机、关联入住的房号 */
  customer?: { name: string; phone: string }
  occupancy?: { occupancyNo: string; status: string; room: { roomNo: string } } | null
}

export interface CreateMotherProfileDto {
  customerId: string
  occupancyId?: string
  deliveryMethod?: DeliveryMethod
  deliveryDate?: string
  gestationalWeeks?: number
  expectedDeliveryDate?: string
  careNote?: string
  primaryNurseId?: string
  remark?: string
  riskTagIds?: string[]
  babies?: BabyProfileInput[]
}

export interface UpdateMotherProfileDto {
  occupancyId?: string
  deliveryMethod?: DeliveryMethod
  deliveryDate?: string
  gestationalWeeks?: number
  expectedDeliveryDate?: string
  careNote?: string
  /** 传 null 表示清除护理师 */
  primaryNurseId?: string | null
  remark?: string
  version: number
}

export interface CarePlanTask {
  id: string
  carePlanId: string
  dayOffset: number
  scheduledDate: string
  formTemplateId: string
  formTemplate: CareFormTemplate
  status: CarePlanTaskStatus
  careRecordId: string | null
}

export interface CarePlan extends ScopedEntityBase {
  storeId: string
  planNo: string
  planTemplateId: string
  motherProfileId: string | null
  babyProfileId: string | null
  startDate: string
  status: CarePlanStatus
  terminateReason: string | null
  tasks: CarePlanTask[]
}

export interface CreateCarePlanDto {
  planTemplateId: string
  motherProfileId?: string
  babyProfileId?: string
  startDate: string
}

export interface CareRecord {
  id: string
  tenantId: string
  storeId: string
  recordNo: string
  formTemplateId: string
  targetType: CareTargetType
  motherProfileId: string | null
  babyProfileId: string | null
  occurredAt: string
  values: Record<string, unknown>
  isBackfilled: boolean
  backfillReason: string | null
  correctionOfId: string | null
  submittedBy: string
  createdAt: string
  formTemplate: CareFormTemplate
  corrections: CareRecord[]
  abnormalities: CareAbnormality[]
}

export interface CreateCareRecordDto {
  formTemplateId: string
  motherProfileId?: string
  babyProfileId?: string
  occurredAt: string
  values: Record<string, unknown>
  carePlanTaskId?: string
  isBackfilled?: boolean
  backfillReason?: string
  correctionOfId?: string
}

export interface CreateCareRecordResponse {
  record: CareRecord
  abnormalities: CareAbnormality[]
}

export interface CareAbnormality extends ScopedEntityBase {
  storeId: string
  careRecordId: string
  fieldId: string
  targetType: CareTargetType
  motherProfileId: string | null
  babyProfileId: string | null
  occurredAt: string
  fieldValue: unknown
  status: CareAbnormalityStatus
  resolvedBy: string | null
  resolvedAt: string | null
  resolveNote: string | null
  field: CareFieldDefinition
  careRecord: CareRecord
}

export interface CareAbnormalityFollowUp {
  id: string
  businessType: string
  businessId: string
  type: string
  content: string
  nextFollowUpAt: string | null
  createdBy: string
  createdAt: string
}

export type CareOutreachPlanStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED'
export type CareOutreachTaskStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED'

export interface CareOutreachTemplateItem {
  id: string
  dayOffset: number
  title: string
  content: string | null
}

export interface CareOutreachTemplate extends ScopedEntityBase {
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  items: CareOutreachTemplateItem[]
}

export interface CareOutreachTemplateItemInput {
  dayOffset: number
  title: string
  content?: string
}

export interface CreateCareOutreachTemplateDto {
  code: string
  name: string
  items: CareOutreachTemplateItemInput[]
}

export interface UpdateCareOutreachTemplateDto {
  name?: string
  status?: 'ACTIVE' | 'INACTIVE'
  items?: CareOutreachTemplateItemInput[]
  version: number
}

export interface CareOutreachTask {
  id: string
  planId: string
  dayOffset: number
  scheduledDate: string
  title: string
  content: string | null
  status: CareOutreachTaskStatus
  completedById: string | null
  completedAt: string | null
  completionNote: string | null
}

export interface CareOutreachPlan extends ScopedEntityBase {
  storeId: string
  planNo: string
  templateId: string
  motherProfileId: string
  checkedOutAt: string
  status: CareOutreachPlanStatus
  terminateReason: string | null
  tasks: CareOutreachTask[]
}

export interface CareOutreachPendingTask extends CareOutreachTask {
  plan: CareOutreachPlan & { motherProfile: { customer: { name: string } } }
}

export interface CreateCareOutreachPlanDto {
  motherProfileId: string
  templateId: string
  checkedOutAt: string
}
