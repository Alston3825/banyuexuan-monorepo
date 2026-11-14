import type { AiSuggestion } from './ai'

export interface QueryBusinessReportParams {
  storeId?: string
  startDate: string
  endDate: string
}

export interface PaymentByMethod {
  method: string
  amount: number
}

export interface FinanceSummary {
  storeScope: string
  paymentTotalAmount: number
  paymentRefundedAmount: number
  paymentByMethod: PaymentByMethod[]
  accountRechargeAmount: number
  accountConsumeAmount: number
  accountRefundAmount: number
  accountAdjustAmount: number
  accountCurrentBalance: number
}

export interface OccupancyDailyPoint {
  date: string
  occupiedRooms: number
  totalRooms: number
  occupancyRate: number
}

export interface OccupancySummary {
  storeScope: string
  totalRooms: number
  averageOccupancyRate: number
  daily: OccupancyDailyPoint[]
}

export interface BusinessAnalysisResult {
  suggestion: AiSuggestion
  financeSummary: FinanceSummary
  occupancySummary: OccupancySummary
}
