import type { VNodeChild } from 'vue'
import type { FormItemRule } from 'naive-ui'

export interface CrudColumn<T> {
  key: string
  title: string
  render?: (row: T) => VNodeChild
  width?: number
}

export type CrudSelectOption = { label: string; value: string | number }

export interface CrudFormField {
  key: string
  label: string
  component: 'input' | 'select' | 'number' | 'textarea'
  rules?: FormItemRule[]
  options?: CrudSelectOption[] | (() => Promise<CrudSelectOption[]>)
  showOn: 'create' | 'update' | 'both'
  placeholder?: string
}
