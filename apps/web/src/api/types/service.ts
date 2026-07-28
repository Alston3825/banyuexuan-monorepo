import type { CommonStatus, ScopedEntityBase } from './common'

export type CustomerServicePackageStatus = 'ACTIVE' | 'EXHAUSTED'
export type ServiceAppointmentStatus = 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export interface ServiceProduct extends ScopedEntityBase {
  code: string
  name: string
  durationMinutes: number | null
  unitPrice: number | null
  status: CommonStatus
}

export interface CreateServiceProductDto {
  code: string
  name: string
  durationMinutes?: number
  unitPrice?: number
}

export interface UpdateServiceProductDto {
  name?: string
  durationMinutes?: number
  unitPrice?: number
  status?: CommonStatus
  version: number
}

export interface ServicePackage extends ScopedEntityBase {
  code: string
  name: string
  totalSessions: number
  price: number
  status: CommonStatus
}

export interface CreateServicePackageDto {
  code: string
  name: string
  totalSessions: number
  price: number
}

export interface UpdateServicePackageDto {
  name?: string
  totalSessions?: number
  price?: number
  status?: CommonStatus
  version: number
}

export interface Therapist extends ScopedEntityBase {
  storeId: string
  name: string
  phone: string | null
  status: CommonStatus
}

export interface CreateTherapistDto {
  storeId: string
  name: string
  phone?: string
}

export interface UpdateTherapistDto {
  name?: string
  phone?: string
  status?: CommonStatus
  version: number
}

export interface CustomerServicePackage extends ScopedEntityBase {
  storeId: string
  customerId: string
  packageId: string
  remainingSessions: number
  amount: number
  status: CustomerServicePackageStatus
  purchasedAt: string
  package: ServicePackage
}

export interface CreateCustomerServicePackageDto {
  storeId: string
  customerId: string
  packageId: string
  amount: number
}

export interface ServiceAppointment extends ScopedEntityBase {
  storeId: string
  appointmentNo: string
  customerId: string
  productId: string
  therapistId: string | null
  sourcePackageId: string | null
  scheduledAt: string
  durationMinutes: number
  status: ServiceAppointmentStatus
  completedAt: string | null
  cancelReason: string | null
  rating: number | null
  comment: string | null
  product: ServiceProduct
  therapist: Therapist | null
  sourcePackage: (CustomerServicePackage & { package: ServicePackage }) | null
}

export interface CreateServiceAppointmentDto {
  storeId: string
  customerId: string
  productId: string
  therapistId?: string
  sourcePackageId?: string
  scheduledAt: string
  durationMinutes: number
}
