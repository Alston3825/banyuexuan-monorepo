import { http } from '../client'
import type { FinanceSummary, OccupancySummary, QueryBusinessReportParams } from '../types/analytics'

export const businessReportApi = {
  financeSummary: (params: QueryBusinessReportParams) => http.get<FinanceSummary>('/analytics/finance-summary', { params }).then((r) => r.data),
  occupancySummary: (params: QueryBusinessReportParams) => http.get<OccupancySummary>('/analytics/occupancy-summary', { params }).then((r) => r.data),
}
