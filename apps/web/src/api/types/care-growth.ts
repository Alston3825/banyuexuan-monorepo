export type GrowthMetric = 'weight' | 'length' | 'head'

export interface GrowthPoint {
  date: string
  ageDays: number
  /** 月龄（早产儿为矫正月龄）；算不出来时为 null */
  ageMonths: number | null
  value: number
  source: 'GROWTH' | 'DAILY' | 'BIRTH' | 'ADMISSION'
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

export interface GrowthTableRow {
  date: string
  ageDays: number | null
  weightG: number | null
  lengthCm: number | null
  headCm: number | null
  sources: { weight: GrowthPoint['source'] | null; length: GrowthPoint['source'] | null; head: GrowthPoint['source'] | null }
  /** 有值 = 这一天有人手工录入/修改过 */
  recordId: string | null
  note: string | null
  editedByName: string | null
}

export type GrowthStandard = 'CN' | 'WHO'

export interface GrowthReport {
  baby: { id: string; name: string | null; sequenceNo: number; sex: 'MALE' | 'FEMALE' | null; birthDate: string | null; preterm: boolean; gestationalWeeks: number | null }
  ready: boolean
  notReady: string[]
  /** 数据上的提醒（如填了入所体重却没填入所日期） */
  hints?: string[]
  /** 生长数据表：按日期合并的体重/身长/头围（曲线用的就是这些数据） */
  table?: GrowthTableRow[]
  points: Record<GrowthMetric, GrowthPoint[]>
  curves: Record<GrowthMetric, { ages: number[]; rows: number[][] } | null>
  latest: GrowthLatest[]
  records: { id: string; date: string; weightG: number | null; lengthCm: number | null; headCm: number | null; measuredByName: string | null; note: string | null }[]
  /** 当前对比用的标准：CN=国家卫健委 WS/T 423—2022，WHO=世界卫生组织 */
  standard: GrowthStandard
  standardLabel: string
  source: string
  /** 曲线最多展示到第几个月 */
  maxMonths: number
  generatedAt: string
}
