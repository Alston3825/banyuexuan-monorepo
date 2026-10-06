import type { ScopedEntityBase } from './common'

/** PENDING_REVIEW=待核对（已上传，AI 识别后等销售核对确认）；ACTIVE=已确认；VOIDED=已作废。其余是历史遗留状态。 */
export type ContractStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'VOIDED' | 'PENDING_REVIEW'
export type ContractExtractStatus = 'NONE' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
export type CareMode = 'ONE_TO_ONE' | 'ONE_TO_TWO'
export type ContractOrientation = 'SOUTH' | 'NORTH' | 'BOTH'
export type PaymentMethodCode = 'CASH' | 'BANK_TRANSFER' | 'WECHAT' | 'ALIPAY' | 'POS_CARD' | 'OTHER'

export const CARE_MODE_LABEL: Record<CareMode, string> = { ONE_TO_ONE: '1对1', ONE_TO_TWO: '1对2' }
export const ORIENTATION_LABEL: Record<ContractOrientation, string> = { SOUTH: '南向', NORTH: '北向', BOTH: '南北通透' }

/** 日期一律是 'YYYY-MM-DDT00:00:00.000Z'，取前 10 位就是合同上的日期（不做时区换算）。 */
export interface Contract extends ScopedEntityBase {
  contractNo: string
  customerId: string | null
  storeId: string
  title: string
  amount: number // 套餐金额，分
  status: ContractStatus
  voidReason: string | null
  paperNo: string | null
  signedDate: string | null
  signerId: string | null
  clientName: string | null
  clientPhone: string | null
  clientIdCardNo: string | null
  clientHospital: string | null
  clientAddress: string | null
  emergencyName: string | null
  emergencyRelation: string | null
  emergencyPhone: string | null
  fetus: string | null
  dueDate: string | null
  roomTypeText: string | null
  roomTypeId: string | null
  orientation: ContractOrientation | null
  careMode: CareMode | null
  inHouseDays: number | null
  homeServiceDays: number
  daysText: string | null
  estimatedCheckIn: string | null
  estimatedCheckOut: string | null
  depositAmount: number | null // 分
  depositPaid: boolean
  depositMethod: PaymentMethodCode | null
  depositPaidAt: string | null
  depositPaymentId: string | null
  extractStatus: ContractExtractStatus
  extractError: string | null
  extractWarnings: ExtractWarning[] | null
  extractedAt: string | null
  confirmedAt: string | null
}

export interface ExtractWarning {
  field: string
  level: 'missing' | 'warn' | 'info'
  message: string
  page: number | null
}

export interface ContractFile {
  id: string
  kind: 'ORIGINAL' | 'PAGE'
  fileName: string
  mimeType: string
  sizeBytes: number
  pageNo: number | null
  pageKind: string | null
}

export interface ContractItem {
  id?: string
  name: string
  quantity: string | null
  needsReview: boolean
}

export interface ContractListItem extends Contract {
  signer: { id: string; realName: string } | null
  roomType: { id: string; name: string } | null
  customer: { id: string; name: string } | null
  /** 未取消的预订记录；空数组=还没排房 */
  roomOccupancies: { id: string; status: string; roomId: string }[]
}

export interface ContractDetail extends ContractListItem {
  files: ContractFile[]
  items: ContractItem[]
}

export interface CustomerMatch {
  id: string
  customerNo: string
  name: string
  phone: string
  expectedDueDate: string | null
  reason: 'PHONE' | 'NAME'
}

export interface QueryContractParams {
  customerId?: string
  storeId?: string
  status?: ContractStatus
  keyword?: string
  /** 待排房：已确认、还没有有效预订，按签单先后排序 */
  unassigned?: boolean
}

/** 核对页保存的内容；null 表示清空该项。金额用分。 */
export type UpdateContractDto = Partial<{
  paperNo: string | null
  signedDate: string | null
  signerId: string | null
  clientName: string | null
  clientPhone: string | null
  clientIdCardNo: string | null
  clientHospital: string | null
  clientAddress: string | null
  emergencyName: string | null
  emergencyRelation: string | null
  emergencyPhone: string | null
  fetus: string | null
  dueDate: string | null
  roomTypeText: string | null
  roomTypeId: string | null
  orientation: ContractOrientation | null
  careMode: CareMode | null
  inHouseDays: number | null
  homeServiceDays: number
  daysText: string | null
  estimatedCheckIn: string | null
  estimatedCheckOut: string | null
  amount: number
  depositAmount: number | null
  depositPaid: boolean
  depositMethod: PaymentMethodCode | null
  depositPaidAt: string | null
  items: { name: string; quantity?: string | null; needsReview?: boolean }[]
}> & { version: number }
