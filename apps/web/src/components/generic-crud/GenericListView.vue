<script setup lang="ts" generic="T extends { id: string; version: number }">
import { computed, h } from 'vue'
import { NButton, NSpace, NDataTable, type DataTableColumns } from 'naive-ui'
import type { CrudColumn } from './types'

const props = defineProps<{
  resourceName: string
  columns: CrudColumn<T>[]
  rows: T[]
  loading: boolean
  deleteLabel?: string
}>()

const emit = defineEmits<{
  create: []
  edit: [T]
  delete: [T]
}>()

const tableColumns = (): DataTableColumns<T> => [
  ...props.columns.map((c) => ({
    key: c.key,
    title: c.title,
    width: c.width,
    render: c.render ? (row: T) => c.render!(row) : undefined,
  })),
  {
    key: 'actions',
    title: '操作',
    width: 160,
    render: (row: T) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => emit('edit', row) }, { default: () => '编辑' }),
          h(
            NButton,
            { size: 'small', type: 'error', quaternary: true, onClick: () => emit('delete', row) },
            { default: () => props.deleteLabel ?? '删除' },
          ),
        ],
      }),
  },
]

// 表格没有专门做移动端适配的分栏布局，窄屏下用横向滚动代替换行，避免文字逐字换行的问题
const scrollX = computed(() => Math.max(640, props.columns.reduce((sum, c) => sum + (c.width ?? 160), 0) + 160))
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="emit('create')">新建{{ resourceName }}</n-button>
    </n-space>
    <n-data-table :columns="tableColumns()" :data="rows" :loading="loading" :row-key="(r: T) => r.id" :scroll-x="scrollX" />
  </div>
</template>
