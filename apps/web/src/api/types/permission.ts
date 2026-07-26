export type PermissionPointType = 'MODULE' | 'PAGE' | 'BUTTON' | 'FIELD'

export interface PermissionPoint {
  id: string
  applicationId: string | null
  parentId: string | null
  type: PermissionPointType
  code: string
  name: string
  isSensitive: boolean
  createdAt: string
  updatedAt: string
}

export interface PermissionTreeNode extends PermissionPoint {
  children: PermissionTreeNode[]
}
