export type ParameterValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'

export interface Parameter {
  id: string
  tenantId: string | null
  storeId: string | null
  key: string
  value: string
  valueType: ParameterValueType
  description: string | null
  isSystem: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateParameterDto {
  key: string
  value: string
  valueType?: ParameterValueType
  description?: string
  storeId?: string
}

export interface UpdateParameterDto {
  value?: string
  description?: string
  version: number
}
