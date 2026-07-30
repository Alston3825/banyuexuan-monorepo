import { http } from '../client'
import type { AiSuggestion, AskCustomerServiceDto, CareAbnormalitySuggestionAnswer, CustomerServiceAnswer } from '../types/ai'
import type { BusinessAnalysisResult, QueryBusinessReportParams } from '../types/analytics'

export const aiSuggestionApi = {
  list: (params?: { scenario?: string; businessType?: string; businessId?: string; status?: string }) =>
    http.get<AiSuggestion[]>('/ai/suggestions', { params }).then((r) => r.data),
  accept: (id: string, version: number) => http.post<AiSuggestion>(`/ai/suggestions/${id}/accept`, { version }).then((r) => r.data),
  dismiss: (id: string, version: number) => http.post<AiSuggestion>(`/ai/suggestions/${id}/dismiss`, { version }).then((r) => r.data),
}

export const customerServiceAgentApi = {
  ask: (body: AskCustomerServiceDto) => http.post<CustomerServiceAnswer>('/ai/customer-service-agent/ask', body).then((r) => r.data),
}

export const careAbnormalityAgentApi = {
  suggest: (abnormalityId: string) => http.post<CareAbnormalitySuggestionAnswer>(`/ai/care-abnormality-agent/${abnormalityId}/suggest`).then((r) => r.data),
}

export const businessAnalyticsAgentApi = {
  analyze: (body: QueryBusinessReportParams) => http.post<BusinessAnalysisResult>('/ai/business-analytics-agent/analyze', body).then((r) => r.data),
}
