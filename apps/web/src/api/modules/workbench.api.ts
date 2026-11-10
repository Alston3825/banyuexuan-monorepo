import { http } from '../client'

export type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4'
export type RepeatKind = 'NONE' | 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY'
export interface PersonalTask { id: string; title: string; note: string | null; quadrant: Quadrant; done: boolean; doneAt: string | null }
export interface DayReminder { id: string; title: string; note: string | null; timeOfDay: string | null; repeat: RepeatKind; startDate: string; overdue: boolean; done: boolean; date: string }
export interface ReminderDef { id: string; title: string; note: string | null; repeat: RepeatKind; startDate: string; timeOfDay: string | null; weekday: number | null; monthDay: number | null }
export interface WorkStep { id: string; title: string; result: string | null; done: boolean; doneAt: string | null }
export interface OngoingWork { id: string; title: string; note: string | null; finished: boolean; steps: WorkStep[] }
export interface QuickLinkRow { path: string; label: string }

const b = '/workspace/my'
export const workbenchApi = {
  tasks: () => http.get<PersonalTask[]>(`${b}/tasks`).then((r) => r.data),
  createTask: (d: { title: string; note?: string; quadrant: Quadrant }) => http.post<PersonalTask>(`${b}/tasks`, d).then((r) => r.data),
  updateTask: (id: string, d: Partial<{ title: string; note: string; quadrant: Quadrant; done: boolean }>) => http.patch<PersonalTask>(`${b}/tasks/${id}`, d).then((r) => r.data),
  deleteTask: (id: string) => http.delete(`${b}/tasks/${id}`),

  reminders: (date?: string) => http.get<DayReminder[]>(`${b}/reminders`, { params: { date } }).then((r) => r.data),
  reminderDefs: () => http.get<ReminderDef[]>(`${b}/reminders/defs`).then((r) => r.data),
  reminderBadge: () => http.get<{ pending: number }>(`${b}/reminders/badge`, { silent403: true } as any).then((r) => r.data),
  createReminder: (d: Partial<ReminderDef>) => http.post(`${b}/reminders`, d).then((r) => r.data),
  updateReminder: (id: string, d: Partial<ReminderDef>) => http.patch(`${b}/reminders/${id}`, d).then((r) => r.data),
  deleteReminder: (id: string) => http.delete(`${b}/reminders/${id}`),
  markReminder: (id: string, date: string, done: boolean) => http.post(`${b}/reminders/${id}/mark`, { date, done }),

  ongoing: () => http.get<OngoingWork[]>(`${b}/ongoing`).then((r) => r.data),
  createOngoing: (d: { title: string; note?: string; steps?: string[] }) => http.post<OngoingWork>(`${b}/ongoing`, d).then((r) => r.data),
  updateOngoing: (id: string, d: Partial<{ title: string; note: string; finished: boolean }>) => http.patch(`${b}/ongoing/${id}`, d).then((r) => r.data),
  deleteOngoing: (id: string) => http.delete(`${b}/ongoing/${id}`),
  addStep: (id: string, title: string) => http.post(`${b}/ongoing/${id}/steps`, { title }).then((r) => r.data),
  updateStep: (id: string, stepId: string, d: Partial<{ title: string; result: string; done: boolean }>) => http.patch(`${b}/ongoing/${id}/steps/${stepId}`, d).then((r) => r.data),
  deleteStep: (id: string, stepId: string) => http.delete(`${b}/ongoing/${id}/steps/${stepId}`),

  links: () => http.get<QuickLinkRow[]>(`${b}/links`).then((r) => r.data),
  saveLinks: (links: QuickLinkRow[]) => http.put<QuickLinkRow[]>(`${b}/links`, { links }).then((r) => r.data),
}
