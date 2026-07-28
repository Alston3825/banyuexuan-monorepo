import { http } from '../client'
import type {
  CreateCustomerServicePackageDto,
  CreateServiceAppointmentDto,
  CreateServicePackageDto,
  CreateServiceProductDto,
  CreateTherapistDto,
  CustomerServicePackage,
  ServiceAppointment,
  ServicePackage,
  ServiceProduct,
  Therapist,
  UpdateServicePackageDto,
  UpdateServiceProductDto,
  UpdateTherapistDto,
} from '../types/service'

export const serviceProductApi = {
  list: () => http.get<ServiceProduct[]>('/service/products').then((r) => r.data),
  create: (body: CreateServiceProductDto) => http.post<ServiceProduct>('/service/products', body).then((r) => r.data),
  update: (id: string, body: UpdateServiceProductDto) => http.patch<ServiceProduct>(`/service/products/${id}`, body).then((r) => r.data),
}

export const servicePackageApi = {
  list: () => http.get<ServicePackage[]>('/service/packages').then((r) => r.data),
  create: (body: CreateServicePackageDto) => http.post<ServicePackage>('/service/packages', body).then((r) => r.data),
  update: (id: string, body: UpdateServicePackageDto) => http.patch<ServicePackage>(`/service/packages/${id}`, body).then((r) => r.data),
}

export const therapistApi = {
  list: (params?: { storeId?: string }) => http.get<Therapist[]>('/service/therapists', { params }).then((r) => r.data),
  create: (body: CreateTherapistDto) => http.post<Therapist>('/service/therapists', body).then((r) => r.data),
  update: (id: string, body: UpdateTherapistDto) => http.patch<Therapist>(`/service/therapists/${id}`, body).then((r) => r.data),
}

export const customerServicePackageApi = {
  list: (params?: { customerId?: string; storeId?: string }) =>
    http.get<CustomerServicePackage[]>('/service/customer-packages', { params }).then((r) => r.data),
  get: (id: string) => http.get<CustomerServicePackage>(`/service/customer-packages/${id}`).then((r) => r.data),
  create: (body: CreateCustomerServicePackageDto) => http.post<CustomerServicePackage>('/service/customer-packages', body).then((r) => r.data),
}

export const serviceAppointmentApi = {
  list: (params?: { customerId?: string; therapistId?: string; storeId?: string; status?: string }) =>
    http.get<ServiceAppointment[]>('/service/appointments', { params }).then((r) => r.data),
  create: (body: CreateServiceAppointmentDto) => http.post<ServiceAppointment>('/service/appointments', body).then((r) => r.data),
  complete: (id: string, version: number) => http.post<ServiceAppointment>(`/service/appointments/${id}/complete`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, noShow: boolean, version: number) =>
    http.post<ServiceAppointment>(`/service/appointments/${id}/cancel`, { cancelReason, noShow, version }).then((r) => r.data),
  feedback: (id: string, rating: number, comment?: string) =>
    http.post<ServiceAppointment>(`/service/appointments/${id}/feedback`, { rating, comment }).then((r) => r.data),
}
