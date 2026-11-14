import { http } from '../client'
import type {
  CreateUtilityExpenseDto,
  CreateVehicleBookingDto,
  CreateVehicleDto,
  UpdateUtilityExpenseDto,
  UpdateVehicleDto,
  UtilityExpense,
  Vehicle,
  VehicleBooking,
} from '../types/logistics'

export const vehicleApi = {
  list: () => http.get<Vehicle[]>('/logistics/vehicles').then((r) => r.data),
  create: (body: CreateVehicleDto) => http.post<Vehicle>('/logistics/vehicles', body).then((r) => r.data),
  update: (id: string, body: UpdateVehicleDto) => http.patch<Vehicle>(`/logistics/vehicles/${id}`, body).then((r) => r.data),
}

export const vehicleBookingApi = {
  list: (params?: { vehicleId?: string; storeId?: string; status?: string }) => http.get<VehicleBooking[]>('/logistics/vehicle-bookings', { params }).then((r) => r.data),
  create: (body: CreateVehicleBookingDto) => http.post<VehicleBooking>('/logistics/vehicle-bookings', body).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) => http.post<VehicleBooking>(`/logistics/vehicle-bookings/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const utilityExpenseApi = {
  list: (params?: { storeId?: string; period?: string }) => http.get<UtilityExpense[]>('/logistics/utility-expenses', { params }).then((r) => r.data),
  create: (body: CreateUtilityExpenseDto) => http.post<UtilityExpense>('/logistics/utility-expenses', body).then((r) => r.data),
  update: (id: string, body: UpdateUtilityExpenseDto) => http.patch<UtilityExpense>(`/logistics/utility-expenses/${id}`, body).then((r) => r.data),
}
