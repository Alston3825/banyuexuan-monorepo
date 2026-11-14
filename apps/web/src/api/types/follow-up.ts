export type FollowUpBusinessType = 'LEAD' | 'OPPORTUNITY' | 'CUSTOMER'
export type FollowUpType = 'PHONE_CALL' | 'WECHAT' | 'SMS' | 'ON_SITE_VISIT' | 'INVITATION' | 'OTHER'

export interface FollowUpRecord {
  id: string
  tenantId: string
  businessType: FollowUpBusinessType
  businessId: string
  type: FollowUpType
  content: string
  nextFollowUpAt: string | null
  createdBy: string
  createdAt: string
}

export interface CreateFollowUpDto {
  businessType: FollowUpBusinessType
  businessId: string
  type: FollowUpType
  content: string
  nextFollowUpAt?: string
}
