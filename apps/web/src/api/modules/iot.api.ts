import { http } from '../client'
import type {
  CreateDeviceDto,
  CreateDeviceTypeDto,
  Device,
  DeviceEvent,
  DeviceShadow,
  DeviceType,
  ReportDeviceEventDto,
  UpdateDeviceDto,
  UpdateDeviceTypeDto,
} from '../types/iot'

export const deviceTypeApi = {
  list: () => http.get<DeviceType[]>('/iot/device-types').then((r) => r.data),
  create: (body: CreateDeviceTypeDto) => http.post<DeviceType>('/iot/device-types', body).then((r) => r.data),
  update: (id: string, body: UpdateDeviceTypeDto) => http.patch<DeviceType>(`/iot/device-types/${id}`, body).then((r) => r.data),
}

export const deviceApi = {
  list: (params?: { storeId?: string }) => http.get<Device[]>('/iot/devices', { params }).then((r) => r.data),
  create: (body: CreateDeviceDto) => http.post<Device>('/iot/devices', body).then((r) => r.data),
  update: (id: string, body: UpdateDeviceDto) => http.patch<Device>(`/iot/devices/${id}`, body).then((r) => r.data),
}

export const deviceGatewayApi = {
  listEvents: (params?: { deviceId?: string; storeId?: string }) => http.get<DeviceEvent[]>('/iot/gateway/events', { params }).then((r) => r.data),
  reportEvent: (body: ReportDeviceEventDto) => http.post<DeviceEvent>('/iot/gateway/events', body).then((r) => r.data),
  getShadow: (deviceId: string) => http.get<DeviceShadow>(`/iot/gateway/devices/${deviceId}/shadow`).then((r) => r.data),
  issueCommand: (deviceId: string, desiredState: Record<string, unknown>) =>
    http.post<DeviceShadow>(`/iot/gateway/devices/${deviceId}/commands`, { desiredState }).then((r) => r.data),
  confirmCommand: (deviceId: string) => http.post<DeviceShadow>(`/iot/gateway/devices/${deviceId}/commands/confirm`, {}).then((r) => r.data),
}
