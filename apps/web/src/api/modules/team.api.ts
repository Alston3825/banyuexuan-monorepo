import { http } from '../client'
import type { CreateTeamDto, Team, UpdateTeamDto } from '../types/team'

export const teamApi = {
  list: () => http.get<Team[]>('/platform/teams').then((r) => r.data),
  get: (id: string) => http.get<Team>(`/platform/teams/${id}`).then((r) => r.data),
  create: (body: CreateTeamDto) => http.post<Team>('/platform/teams', body).then((r) => r.data),
  update: (id: string, body: UpdateTeamDto) => http.patch<Team>(`/platform/teams/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/teams/${id}`).then((r) => r.data),
}
