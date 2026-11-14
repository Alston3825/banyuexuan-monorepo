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
  status?: 'ACTIVE' | 'DISABLED'
  /** 跟 hireDate 一起填才会同步建立员工档案，见 stores/RolesView 同款说明 */
  employeeNo?: string
  hireDate?: string
}

export interface UpdateAccountDto {
  realName?: string
  phone?: string
  email?: string
  /** 传 null 表示清空 */
  storeId?: string | null
  departmentId?: string | null
  teamId?: string | null
  positionId?: string | null
  status?: AccountStatus
  version: number
}

/** 员工信息表（Excel）批量开通账号：读表后的逐行结果 */
export interface ImportRow {
  rowNo: number
  employeeNo: string | null
  name: string
  phone: string | null
  storeName: string | null
  teamName: string | null
  departmentName: string | null
  positionName: string | null
  hireDate: string | null
  contractType: string | null
  socialInsurance: string | null
  idCardNo: string | null
  bankAccountNo: string | null
  bankName: string | null
  remark: string | null
}

export interface ImportPreviewRow extends ImportRow {
  storeId: string | null
  employeeNoSuggested: boolean
  newDepartment: boolean
  newPosition: boolean
  resigned: boolean
  existingAccountId: string | null
  existingNo: string | null
  willRenumber: boolean
  issues: { level: 'error' | 'warn'; text: string }[]
}

export interface ImportPreview {
  sheetName: string
  headerRow: number
  ignoredColumns: string[]
  rows: ImportPreviewRow[]
}

export interface ImportCommitDto {
  rows: ImportRow[]
  storeId: string
  createMissing: boolean
  roleId?: string
  importProfileDetails: boolean
}

export interface ImportCommitResult {
  created: number
  renumbered: number
  skipped: number
  failed: { rowNo: number; name: string; error?: string }[]
  results: { rowNo: number; name: string; ok: boolean; employeeNo?: string; error?: string }[]
}

export interface AssignRoleDto {
  roleId: string
  scopeType: DataScopeType
  scopeId?: string
  /** 范围对象可多选（如同时管多家门店），每个对象生成一条分配 */
  scopeIds?: string[]
}
