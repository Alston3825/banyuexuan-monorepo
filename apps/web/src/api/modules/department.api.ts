import { http } from '../client'
import type { CreateDepartmentDto, Department, UpdateDepartmentDto } from '../types/department'

export const departmentApi = {
  list: () => http.get<Department[]>('/platform/departments').then((r) => r.data),
  get: (id: string) => http.get<Department>(`/platform/departments/${id}`).then((r) => r.data),
  create: (body: CreateDepartmentDto) => http.post<Department>('/platform/departments', body).then((r) => r.data),
  update: (id: string, body: UpdateDepartmentDto) =>
    http.patch<Department>(`/platform/departments/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/departments/${id}`).then((r) => r.data),
}
