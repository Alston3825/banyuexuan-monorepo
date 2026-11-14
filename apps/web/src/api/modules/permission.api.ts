import { http } from '../client'
import type { PermissionPoint } from '../types/permission'

export const permissionApi = {
  list: () => http.get<PermissionPoint[]>('/platform/permissions').then((r) => r.data),
}
