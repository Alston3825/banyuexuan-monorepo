import type { RoomBoardEntry } from './room'

export type DeliveryMethod = 'VAGINAL' | 'CESAREAN' | 'UNKNOWN'
export type BabyGender = 'MALE' | 'FEMALE' | 'UNKNOWN'

export interface CareBoardBaby {
  id: string
  sequenceNo: number
  name: string | null
  gender: BabyGender
}

export interface CareBoardCare {
  motherProfileId: string
  deliveryMethod: DeliveryMethod
  deliveryDate: string | null
  gestationalWeeks: number | null
  careNote: string | null
  /** 主责护理师（员工账号）；没指派为 null */
  nurse: { id: string; name: string } | null
  /** 过敏提示：风险标签“高敏”或入住评估填了过敏，任一满足就为 true */
  hasAllergyTag: boolean
  /** 入住评估里的过敏说明 */
  allergyNote: string | null
  /** 今天的日常护理记录是否已填 */
  dailyFilledToday: boolean
  /** 当前生效的妈妈护理计划 */
  plan: { level: string; focusPoints: string | null; nextReviewDue: string | null; reviewOverdue: boolean } | null
  babies: CareBoardBaby[]
}

/** 护理看板一张卡片的数据：房态看板的房间+占用信息，叠加这次入住对应的母婴档案。
 * care 为 null 表示这个入住还没有建母婴档案（或房间本来就不是使用中）。 */
export interface CareBoardEntry extends RoomBoardEntry {
  care: CareBoardCare | null
}

export interface QueryCareBoardParams {
  storeId: string
  date?: string
}
