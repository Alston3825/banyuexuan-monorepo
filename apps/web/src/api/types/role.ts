import type { CommonStatus } from './common'
import type { PermissionPoint } from './permission'

export interface RoleOnPermission {
  id: string
  roleId: string
  permissionPointId: string
  /** 角色列表接口不带详情，只有单个角色详情接口才带 */
  permissionPoint?: PermissionPoint
}

export interface Role {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isSystem: boolean
  status: CommonStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  permissions: RoleOnPermission[]
}

export interface CreateRoleDto {
  code?: string
  name: string
  description?: string
}

export interface UpdateRoleDto {
  name?: string
  description?: string
  status?: CommonStatus
  version: number
}
