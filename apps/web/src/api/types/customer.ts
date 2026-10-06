import type { ScopedEntityBase } from './common'

export type CustomerSource = 'WALK_IN' | 'REFERRAL' | 'ONLINE_AD' | 'SOCIAL_MEDIA' | 'PARTNER' | 'OTHER'

/** 客户类型（多选），文案见 utils/status-map.ts 的 CUSTOMER_SERVICE_TYPE_LABEL_MAP */
export type CustomerServiceType = 'MATERNITY_ROOM' | 'CONFINEMENT_NANNY' | 'MEAL_DELIVERY' | 'POSTPARTUM_RECOVERY' | 'BABY_CARE'

export type ReferrerType = 'CUSTOMER' | 'ACCOUNT'

export interface Customer extends ScopedEntityBase {
  customerNo: string
  name: string
  phone: string
  /** 旧版 6 类渠道归并值（自定义类型记 OTHER），展示请用 channelTypeId */
  source: CustomerSource
  /** 渠道类型 id（可自定义，见客户渠道页） */
  channelTypeId: string | null
  /** 具体渠道（属于上面的渠道类型） */
  channelId: string | null
  primaryStoreId: string | null
  /** 门店销售员（归属销售） */
  assignedToId: string | null
  /** 电话销售员 */
  phoneSalesId: string | null
  wechat: string | null
  serviceTypes: CustomerServiceType[] | null
  hospital: string | null
  expectedDueDate: string | null
  region: string | null
  address: string | null
  /** 片区 */
  zone: string | null
  remark: string | null
  idCardNo: string | null
  birthday: string | null
  hisNo: string | null
  passportNo: string | null
  emergencyContactName: string | null
  emergencyContactRelation: string | null
  emergencyContactPhone: string | null
  referrerType: ReferrerType | null
  referrerId: string | null
  /** 抄送人（员工账号 id） */
  ccAccountIds: string[] | null
  /** 添加时间（可补录），createdAt 是记录入库时间 */
  registeredAt: string
}

/** 新建/编辑客户表单里能填的全部内容；编辑时传 null 表示清空该项。 */
export interface CustomerFormFields {
  wechat?: string | null
  serviceTypes?: CustomerServiceType[]
  hospital?: string | null
  expectedDueDate?: string | null
  region?: string | null
  address?: string | null
  zone?: string | null
  remark?: string | null
  idCardNo?: string | null
  birthday?: string | null
  hisNo?: string | null
  passportNo?: string | null
  emergencyContactName?: string | null
  emergencyContactRelation?: string | null
  emergencyContactPhone?: string | null
  referrerType?: ReferrerType | null
  referrerId?: string | null
  ccAccountIds?: string[] | null
  channelId?: string | null
  assignedToId?: string | null
  phoneSalesId?: string | null
}

export interface CreateCustomerDto extends CustomerFormFields {
  name: string
  phone: string
  /** 再次入住的妈妈（二胎等）允许手机号与已有客户重复 */
  allowDuplicatePhone?: boolean
  channelTypeId: string
  primaryStoreId?: string
  registeredAt?: string
}

export interface UpdateCustomerDto extends CustomerFormFields {
  name?: string
  phone?: string
  allowDuplicatePhone?: boolean
  channelTypeId?: string
  registeredAt?: string
  version: number
}

export interface StaffOption {
  id: string
  realName: string
  username: string
}

export interface ReferrerSearchResult {
  customers: { id: string; name: string; phone: string; customerNo: string }[]
  accounts: StaffOption[]
}

export interface IdCardCheck {
  valid: boolean
  normalized: string
  birthday: string | null
  /** 第 17 位奇数=男，偶数=女 */
  gender: 'MALE' | 'FEMALE' | null
  reason?: string
}

/** 渠道类型（可自定义；legacySource 有值的是系统内置类型，不能删） */
export interface CustomerChannelType extends ScopedEntityBase {
  name: string
  legacySource: CustomerSource | null
  sortOrder: number
  status: 'ACTIVE' | 'INACTIVE'
  channelCount: number
  customerCount: number
}

/** 具体渠道资料（属于某个渠道类型） */
export interface CustomerChannel extends ScopedEntityBase {
  typeId: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  customerCount: number
}

export interface QueryCustomerParams {
  assignedToId?: string
  primaryStoreId?: string
  keyword?: string
}

/** 客户分类/客户类型标签的绑定记录，来自 GET /crm/customers/:id/tags(/history) */
export interface CustomerTagBinding {
  id: string
  tagId: string
  entityType: string
  entityId: string
  createdBy: string
  createdAt: string
  revokedAt: string | null
  tag: { id: string; name: string; category: string | null; color: string | null }
}
