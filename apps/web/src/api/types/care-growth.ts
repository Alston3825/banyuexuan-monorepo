export type GrowthMetric = 'weight' | 'length' | 'head'

export interface GrowthPoint {
  date: string
  ageDays: number
  /** 月龄（早产儿为矫正月龄）；算不出来时为 null */
  ageMonths: number | null
  value: number
  source: 'GROWTH' | 'DAILY' | 'BIRTH'
  recordId?: string
  rating: string | null
  pctText: string | null
  /** 这个月龄上的 P3 P10 P25 P50 P75 P90 P97 */
  row: number[] | null
}

export interface GrowthLatest {
  metric: GrowthMetric
  name: string
  unit: string
  date: string
  value: number
  ageMonths: number | null
  rating: string
  pctText: string
  text: string
  p3: number
  p50: number
  p97: number
}

export interface GrowthReport {
  baby: { id: string; name: string | null; sequenceNo: number; sex: 'MALE' | 'FEMALE' | null; birthDate: string | null; preterm: boolean; gestationalWeeks: number | null }
  ready: boolean
  notReady: string[]
  points: Record<GrowthMetric, GrowthPoint[]>
  curves: Record<GrowthMetric, { ages: number[]; rows: number[][] } | null>
  latest: GrowthLatest[]
  records: { id: string; date: string; weightKg: number | null; lengthCm: number | null; headCm: number | null; measuredByName: string | null; note: string | null }[]
  source: string
  generatedAt: string
}
