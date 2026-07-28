import { http } from '../client'
import type {
  BabyProfile,
  CareAbnormality,
  CareAbnormalityFollowUp,
  CareFieldDefinition,
  CareFormTemplate,
  CarePlan,
  CarePlanTemplate,
  CareRecord,
  CreateBabyProfileDto,
  CreateCareFieldDefinitionDto,
  CreateCareFormTemplateDto,
  CreateCarePlanDto,
  CreateCarePlanTemplateDto,
  CreateCareRecordDto,
  CreateCareRecordResponse,
  CreateMotherProfileDto,
  MotherProfile,
  TagBinding,
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
}

export const babyProfileApi = {
  list: (params?: { motherProfileId?: string; customerId?: string }) =>
    http.get<BabyProfile[]>('/care/baby-profiles', { params }).then((r) => r.data),
  get: (id: string) => http.get<BabyProfile>(`/care/baby-profiles/${id}`).then((r) => r.data),
  create: (body: CreateBabyProfileDto) => http.post<BabyProfile>('/care/baby-profiles', body).then((r) => r.data),
  update: (id: string, body: UpdateBabyProfileDto) =>
    http.patch<BabyProfile>(`/care/baby-profiles/${id}`, body).then((r) => r.data),
  riskTags: (id: string) => http.get<TagBinding[]>(`/care/baby-profiles/${id}/risk-tags`).then((r) => r.data),
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
