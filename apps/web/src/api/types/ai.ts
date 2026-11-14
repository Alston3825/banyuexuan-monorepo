export type AiSuggestionScenario = 'CUSTOMER_SERVICE' | 'CARE_ABNORMALITY' | 'BUSINESS_ANALYTICS'
export type AiSuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED'

export interface AiSuggestion {
  id: string
  tenantId: string
  storeId: string
  scenario: AiSuggestionScenario
  businessType: string
  businessId: string
  inputText: string
  outputText: string
  modelProvider: string
  modelName: string
  usedFallback: boolean
  latencyMs: number
  escalate: boolean
  status: AiSuggestionStatus
  acceptedById: string | null
  acceptedAt: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface AskCustomerServiceDto {
  businessType: 'LEAD' | 'CUSTOMER'
  businessId: string
  storeId: string
  question: string
}

export interface CustomerServiceAnswer {
  suggestion: AiSuggestion
  answer: string
  escalate: boolean
}

export interface CareAbnormalitySuggestionAnswer {
  suggestion: AiSuggestion
  answer: string
}
