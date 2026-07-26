import { http } from '../client'
import type { CreateRoleDto, Role, UpdateRoleDto } from '../types/role'

export const roleApi = {
  list: () => http.get<Role[]>('/platform/roles').then((r) => r.data),
  get: (id: string) => http.get<Role>(`/platform/roles/${id}`).then((r) => r.data),
  create: (body: CreateRoleDto) => http.post<Role>('/platform/roles', body).then((r) => r.data),
  update: (id: string, body: UpdateRoleDto) => http.patch<Role>(`/platform/roles/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/roles/${id}`).then((r) => r.data),
  grantPermission: (id: string, permissionPointId: string) =>
    http.post(`/platform/roles/${id}/permissions`, { permissionPointId }).then((r) => r.data),
  revokePermission: (id: string, permissionPointId: string) =>
    http.delete(`/platform/roles/${id}/permissions/${permissionPointId}`).then((r) => r.data),
}
