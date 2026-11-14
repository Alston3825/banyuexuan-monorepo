import { http } from '../client'
import type { FollowUpRecord, CreateFollowUpDto, FollowUpBusinessType } from '../types/follow-up'

export const followUpApi = {
  list: (businessType: FollowUpBusinessType, businessId: string) =>
    http.get<FollowUpRecord[]>('/crm/follow-ups', { params: { businessType, businessId } }).then((r) => r.data),
  create: (body: CreateFollowUpDto) => http.post<FollowUpRecord>('/crm/follow-ups', body).then((r) => r.data),
}
