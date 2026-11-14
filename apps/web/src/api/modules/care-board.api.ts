import { http } from '../client'
import type { CareBoardEntry, QueryCareBoardParams } from '../types/care-board'

export const careBoardApi = {
  board: (params: QueryCareBoardParams) => http.get<CareBoardEntry[]>('/care/board', { params }).then((r) => r.data),
}
