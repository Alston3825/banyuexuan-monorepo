import type { ScopedEntityBase } from './common'

export type OpportunityStage = 'FOLLOWING' | 'QUOTED' | 'WON' | 'LOST'

export interface SalesOpportunity extends ScopedEntityBase {
  opportunityNo: string
  customerId: string
  leadId: string | null
  stage: OpportunityStage
  amount: number | null
  assignedToId: string | null
  lostReason: string | null
  remark: string | null
}

export interface CreateOpportunityDto {
  customerId: string
  leadId?: string
  amount?: number
  assignedToId?: string
  remark?: string
}

export interface UpdateOpportunityDto {
  amount?: number
  assignedToId?: string
  remark?: string
  version: number
}

export interface QueryOpportunityParams {
  stage?: OpportunityStage
  customerId?: string
  assignedToId?: string
}
