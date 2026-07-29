import type { CommonStatus, ScopedEntityBase } from './common'

export type MealPlanType = 'MONTH_MEAL' | 'MINI_MONTH' | 'TRIAL' | 'DELIVERY' | 'VIP'
export type MealSlot = 'BREAKFAST' | 'MORNING_SNACK' | 'LUNCH' | 'AFTERNOON_SNACK' | 'DINNER' | 'NIGHT_SNACK'
export type DietaryRestrictionCategory = 'INGREDIENT' | 'MEDICAL'
export type DinerProfileStatus = 'ACTIVE' | 'ENDED'
export type MealRecordStatus = 'PLANNED' | 'SERVED' | 'CANCELLED'

export interface MealItem extends ScopedEntityBase {
  code: string
  name: string
  defaultSlot: MealSlot
  ingredientTags: string[] | null
  status: CommonStatus
}

export interface CreateMealItemDto {
  code: string
  name: string
  defaultSlot: MealSlot
  ingredientTags?: string[]
}

export interface UpdateMealItemDto {
  name?: string
  defaultSlot?: MealSlot
  ingredientTags?: string[]
  status?: CommonStatus
  version: number
}

export interface DietaryRestriction extends ScopedEntityBase {
  code: string
  name: string
  category: DietaryRestrictionCategory
  status: CommonStatus
}

export interface CreateDietaryRestrictionDto {
  code: string
  name: string
  category: DietaryRestrictionCategory
}

export interface UpdateDietaryRestrictionDto {
  name?: string
  status?: CommonStatus
  version: number
}

export interface MealPlanTemplateItemInput {
  dayOffset: number
  slot: MealSlot
  mealItemId: string
}

export interface MealPlanTemplateItem {
  id: string
  planTemplateId: string
  dayOffset: number
  slot: MealSlot
  mealItemId: string
  mealItem: MealItem
}

export interface MealPlanTemplate extends ScopedEntityBase {
  code: string
  name: string
  planType: MealPlanType
  totalDays: number
  phases: { name: string; days: number }[] | null
  status: CommonStatus
  items: MealPlanTemplateItem[]
}

export interface CreateMealPlanTemplateDto {
  code: string
  name: string
  planType: MealPlanType
  totalDays: number
  phases?: { name: string; days: number }[]
  items: MealPlanTemplateItemInput[]
}

export interface UpdateMealPlanTemplateDto {
  name?: string
  status?: CommonStatus
  items?: MealPlanTemplateItemInput[]
  version: number
}

export interface DinerProfile extends ScopedEntityBase {
  storeId: string
  customerId: string
  mealPlanTemplateId: string
  occupancyId: string | null
  startDate: string
  endDate: string
  status: DinerProfileStatus
  mealPlanTemplate: MealPlanTemplate
  restrictions: { id: string; restrictionId: string; restriction: DietaryRestriction }[]
}

export interface CreateDinerProfileDto {
  customerId: string
  mealPlanTemplateId: string
  occupancyId?: string
  startDate: string
  restrictionIds?: string[]
}

export interface MealReport {
  totalRecords: number
  plannedCount: number
  servedCount: number
  cancelledCount: number
  customSelectedCount: number
  avgRating: number | null
  bySlot: Record<string, number>
  byMealItem: { mealItemId: string; name: string; servedCount: number }[]
}

export interface MealRecord {
  id: string
  tenantId: string
  storeId: string
  dinerProfileId: string
  scheduledDate: string
  slot: MealSlot
  defaultMealItemId: string
  isCustomSelected: boolean
  selectedMealItemId: string | null
  selectedAt: string | null
  status: MealRecordStatus
  servedAt: string | null
  servedBy: string | null
  rating: number | null
  comment: string | null
  version: number
  defaultMealItem: MealItem
  selectedMealItem: MealItem | null
}
