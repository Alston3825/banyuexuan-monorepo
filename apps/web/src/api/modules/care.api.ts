import { http } from '../client'
import type {
  BabyProfile,
  CareAbnormality,
  CareAbnormalityFollowUp,
  CareFieldDefinition,
  CareFormTemplate,
  CareOutreachPendingTask,
  CareOutreachPlan,
  CareOutreachTemplate,
  CarePlan,
  CarePlanTemplate,
  CareRecord,
  CreateBabyProfileDto,
  CreateCareFieldDefinitionDto,
  CreateCareFormTemplateDto,
  CreateCareOutreachPlanDto,
  CreateCareOutreachTemplateDto,
  CreateCarePlanDto,
  CreateCarePlanTemplateDto,
  CreateCareRecordDto,
  CreateCareRecordResponse,
  CreateMotherProfileDto,
  MotherProfile,
  TagBinding,
  UpdateCareOutreachTemplateDto,
  UpdateBabyProfileDto,
  UpdateCareFieldDefinitionDto,
  UpdateCareFormTemplateDto,
  UpdateCarePlanTemplateDto,
  UpdateMotherProfileDto,
} from '../types/care'

export const careFieldApi = {
  list: (targetType?: 'MOTHER' | 'BABY') =>
    http.get<CareFieldDefinition[]>('/care/fields', { params: { targetType } }).then((r) => r.data),
  get: (id: string) => http.get<CareFieldDefinition>(`/care/fields/${id}`).then((r) => r.data),
  create: (body: CreateCareFieldDefinitionDto) => http.post<CareFieldDefinition>('/care/fields', body).then((r) => r.data),
  update: (id: string, body: UpdateCareFieldDefinitionDto) =>
    http.patch<CareFieldDefinition>(`/care/fields/${id}`, body).then((r) => r.data),
}

export const careFormTemplateApi = {
  list: (params?: { targetType?: 'MOTHER' | 'BABY' }) =>
    http.get<CareFormTemplate[]>('/care/form-templates', { params }).then((r) => r.data),
  get: (id: string) => http.get<CareFormTemplate>(`/care/form-templates/${id}`).then((r) => r.data),
  create: (body: CreateCareFormTemplateDto) => http.post<CareFormTemplate>('/care/form-templates', body).then((r) => r.data),
  update: (id: string, body: UpdateCareFormTemplateDto) =>
    http.patch<CareFormTemplate>(`/care/form-templates/${id}`, body).then((r) => r.data),
}

export const carePlanTemplateApi = {
  list: (params?: { targetType?: 'MOTHER' | 'BABY' }) =>
    http.get<CarePlanTemplate[]>('/care/plan-templates', { params }).then((r) => r.data),
  get: (id: string) => http.get<CarePlanTemplate>(`/care/plan-templates/${id}`).then((r) => r.data),
  create: (body: CreateCarePlanTemplateDto) => http.post<CarePlanTemplate>('/care/plan-templates', body).then((r) => r.data),
  update: (id: string, body: UpdateCarePlanTemplateDto) =>
    http.patch<CarePlanTemplate>(`/care/plan-templates/${id}`, body).then((r) => r.data),
}

export const motherProfileApi = {
  list: (params?: { customerId?: string; storeId?: string }) =>
    http.get<MotherProfile[]>('/care/mother-profiles', { params }).then((r) => r.data),
  get: (id: string) => http.get<MotherProfile>(`/care/mother-profiles/${id}`).then((r) => r.data),
  create: (body: CreateMotherProfileDto) => http.post<MotherProfile>('/care/mother-profiles', body).then((r) => r.data),
  update: (id: string, body: UpdateMotherProfileDto) =>
    http.patch<MotherProfile>(`/care/mother-profiles/${id}`, body).then((r) => r.data),
  riskTags: (id: string) => http.get<TagBinding[]>(`/care/mother-profiles/${id}/risk-tags`).then((r) => r.data),
  /** 编辑风险标签：整体改成 tagIds（只能是母婴风险分类的标签） */
  setRiskTags: (id: string, tagIds: string[]) => http.put<TagBinding[]>(`/care/mother-profiles/${id}/risk-tags`, { tagIds }).then((r) => r.data),
  nurseOptions: (storeId?: string) =>
    http.get<{ id: string; name: string; roles: string[]; isNurse: boolean }[]>('/care/mother-profiles/nurse-options', { params: { storeId } }).then((r) => r.data),
}

export const babyProfileApi = {
  list: (params?: { motherProfileId?: string; customerId?: string }) =>
    http.get<BabyProfile[]>('/care/baby-profiles', { params }).then((r) => r.data),
  get: (id: string) => http.get<BabyProfile>(`/care/baby-profiles/${id}`).then((r) => r.data),
  create: (body: CreateBabyProfileDto) => http.post<BabyProfile>('/care/baby-profiles', body).then((r) => r.data),
  update: (id: string, body: UpdateBabyProfileDto) =>
    http.patch<BabyProfile>(`/care/baby-profiles/${id}`, body).then((r) => r.data),
  riskTags: (id: string) => http.get<TagBinding[]>(`/care/baby-profiles/${id}/risk-tags`).then((r) => r.data),
  setRiskTags: (id: string, tagIds: string[]) => http.put<TagBinding[]>(`/care/baby-profiles/${id}/risk-tags`, { tagIds }).then((r) => r.data),
  /** 删除前检查：名下有哪些数据、能不能删、当前账号能不能连数据一起删 */
  deleteCheck: (id: string) =>
    http.get<{ babyId: string; babyName: string; blockers: string[]; attached: string[]; canForceDelete: boolean }>(`/care/baby-profiles/${id}/delete-check`).then((r) => r.data),
  /** 删除建错的宝宝档案；名下有评估表/纸质资料时需 force + 输入宝宝名字确认（管理员） */
  remove: (id: string, opts?: { force?: boolean; confirmName?: string }) =>
    http.delete(`/care/baby-profiles/${id}`, { params: opts?.force ? { force: true, confirmName: opts.confirmName } : undefined }).then(() => undefined),
}

export const carePlanApi = {
  list: (params?: { motherProfileId?: string; babyProfileId?: string; status?: string }) =>
    http.get<CarePlan[]>('/care/plans', { params }).then((r) => r.data),
  get: (id: string) => http.get<CarePlan>(`/care/plans/${id}`).then((r) => r.data),
  create: (body: CreateCarePlanDto) => http.post<CarePlan>('/care/plans', body).then((r) => r.data),
  terminate: (id: string, reason: string, version: number) =>
    http.post<CarePlan>(`/care/plans/${id}/terminate`, { reason, version }).then((r) => r.data),
}

export const careRecordApi = {
  list: (params?: { motherProfileId?: string; babyProfileId?: string; formTemplateId?: string }) =>
    http.get<CareRecord[]>('/care/records', { params }).then((r) => r.data),
  get: (id: string) => http.get<CareRecord>(`/care/records/${id}`).then((r) => r.data),
  create: (body: CreateCareRecordDto) => http.post<CreateCareRecordResponse>('/care/records', body).then((r) => r.data),
}

export const careAbnormalityApi = {
  list: (params?: { motherProfileId?: string; babyProfileId?: string; status?: string }) =>
    http.get<CareAbnormality[]>('/care/abnormalities', { params }).then((r) => r.data),
  get: (id: string) => http.get<CareAbnormality>(`/care/abnormalities/${id}`).then((r) => r.data),
  followUps: (id: string) => http.get<CareAbnormalityFollowUp[]>(`/care/abnormalities/${id}/follow-ups`).then((r) => r.data),
  follow: (id: string, body: { type: string; content: string; nextFollowUpAt?: string }) =>
    http.post<CareAbnormalityFollowUp>(`/care/abnormalities/${id}/follow-ups`, body).then((r) => r.data),
  resolve: (id: string, resolveNote: string | undefined, version: number) =>
    http.post<CareAbnormality>(`/care/abnormalities/${id}/resolve`, { resolveNote, version }).then((r) => r.data),
  ignore: (id: string, resolveNote: string | undefined, version: number) =>
    http.post<CareAbnormality>(`/care/abnormalities/${id}/ignore`, { resolveNote, version }).then((r) => r.data),
}

export const careOutreachTemplateApi = {
  list: () => http.get<CareOutreachTemplate[]>('/care/outreach-templates').then((r) => r.data),
  create: (body: CreateCareOutreachTemplateDto) => http.post<CareOutreachTemplate>('/care/outreach-templates', body).then((r) => r.data),
  update: (id: string, body: UpdateCareOutreachTemplateDto) => http.patch<CareOutreachTemplate>(`/care/outreach-templates/${id}`, body).then((r) => r.data),
}

export const careOutreachPlanApi = {
  list: (motherProfileId?: string) => http.get<CareOutreachPlan[]>('/care/outreach-plans', { params: { motherProfileId } }).then((r) => r.data),
  get: (id: string) => http.get<CareOutreachPlan>(`/care/outreach-plans/${id}`).then((r) => r.data),
  create: (body: CreateCareOutreachPlanDto) => http.post<CareOutreachPlan>('/care/outreach-plans', body).then((r) => r.data),
  terminate: (id: string, reason: string, version: number) =>
    http.patch<CareOutreachPlan>(`/care/outreach-plans/${id}/terminate`, { reason, version }).then((r) => r.data),
  pendingTasks: () => http.get<CareOutreachPendingTask[]>('/care/outreach-plans/pending-tasks').then((r) => r.data),
  completeTask: (taskId: string, status: 'COMPLETED' | 'SKIPPED', completionNote?: string) =>
    http.patch(`/care/outreach-plans/tasks/${taskId}/complete`, { status, completionNote }).then((r) => r.data),
}
