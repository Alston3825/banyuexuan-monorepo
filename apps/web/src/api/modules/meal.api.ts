import { http } from '../client'
import type {
  CreateDietaryRestrictionDto,
  CreateDinerProfileDto,
  CreateMealItemDto,
  CreateMealPlanTemplateDto,
  DietaryRestriction,
  DinerProfile,
  MealItem,
  MealPlanTemplate,
  MealRecord,
  MealReport,
  UpdateDietaryRestrictionDto,
  UpdateMealItemDto,
  UpdateMealPlanTemplateDto,
} from '../types/meal'

export const mealItemApi = {
  list: () => http.get<MealItem[]>('/meal/items').then((r) => r.data),
  create: (body: CreateMealItemDto) => http.post<MealItem>('/meal/items', body).then((r) => r.data),
  update: (id: string, body: UpdateMealItemDto) => http.patch<MealItem>(`/meal/items/${id}`, body).then((r) => r.data),
}

export const dietaryRestrictionApi = {
  list: () => http.get<DietaryRestriction[]>('/meal/dietary-restrictions').then((r) => r.data),
  create: (body: CreateDietaryRestrictionDto) => http.post<DietaryRestriction>('/meal/dietary-restrictions', body).then((r) => r.data),
  update: (id: string, body: UpdateDietaryRestrictionDto) =>
    http.patch<DietaryRestriction>(`/meal/dietary-restrictions/${id}`, body).then((r) => r.data),
}

export const mealPlanTemplateApi = {
  list: () => http.get<MealPlanTemplate[]>('/meal/plan-templates').then((r) => r.data),
  get: (id: string) => http.get<MealPlanTemplate>(`/meal/plan-templates/${id}`).then((r) => r.data),
  create: (body: CreateMealPlanTemplateDto) => http.post<MealPlanTemplate>('/meal/plan-templates', body).then((r) => r.data),
  update: (id: string, body: UpdateMealPlanTemplateDto) =>
    http.patch<MealPlanTemplate>(`/meal/plan-templates/${id}`, body).then((r) => r.data),
}

export const dinerProfileApi = {
  list: (params?: { customerId?: string }) => http.get<DinerProfile[]>('/meal/diner-profiles', { params }).then((r) => r.data),
  get: (id: string) => http.get<DinerProfile>(`/meal/diner-profiles/${id}`).then((r) => r.data),
  create: (body: CreateDinerProfileDto) => http.post<DinerProfile>('/meal/diner-profiles', body).then((r) => r.data),
  end: (id: string) => http.post<DinerProfile>(`/meal/diner-profiles/${id}/end`, {}).then((r) => r.data),
}

export const mealRecordApi = {
  list: (params?: { dinerProfileId?: string; scheduledDate?: string; status?: string }) =>
    http.get<MealRecord[]>('/meal/records', { params }).then((r) => r.data),
  report: (params?: { storeId?: string; startDate?: string; endDate?: string }) =>
    http.get<MealReport>('/meal/records/report', { params }).then((r) => r.data),
  select: (id: string, mealItemId: string) => http.post<MealRecord>(`/meal/records/${id}/select`, { mealItemId }).then((r) => r.data),
  serve: (id: string) => http.post<MealRecord>(`/meal/records/${id}/serve`, {}).then((r) => r.data),
  feedback: (id: string, rating: number, comment?: string) =>
    http.post<MealRecord>(`/meal/records/${id}/feedback`, { rating, comment }).then((r) => r.data),
}
