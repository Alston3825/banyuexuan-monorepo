export type AccountStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED'
export type DataScopeType = 'TENANT' | 'REGION' | 'STORE' | 'DEPARTMENT' | 'TEAM' | 'SELF'

export interface AccountRoleAssignment {
  id: string
  tenantId: string
  accountId: string
  roleId: string
  scopeType: DataScopeType
  scopeId: string | null
  grantedBy: string
  grantedAt: string
  expiresAt: string | null
  revokedAt: string | null
  role?: { id: string; code: string; name: string }
}

export interface Account {
  id: string
  tenantId: string
  storeId: string | null
  departmentId: string | null
  teamId: string | null
  positionId: string | null
  username: string
  phone: string | null
  email: string | null
  realName: string
  status: AccountStatus
  lastLoginAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  roleAssignments?: AccountRoleAssignment[]
}

export interface CreateAccountDto {
  username: string
  realName: string
  password: string
  phone?: string
  email?: string
  storeId?: string
  departmentId?: string
  teamId?: string
  positionId?: string
}

export interface UpdateAccountDto {
  realName?: string
  phone?: string
  email?: string
  status?: AccountStatus
  version: number
}

export interface AssignRoleDto {
  roleId: string
  scopeType: DataScopeType
  scopeId?: string
}
