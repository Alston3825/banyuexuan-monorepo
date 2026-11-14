<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NAlert, NButton, NDataTable, NSpace, useDialog, type DataTableColumns } from 'naive-ui'
import { recycleBinApi, type RecycleBinItem } from '../api/modules/recycle-bin.api'
import { message } from '../utils/discrete-api'

const rows = ref<RecycleBinItem[]>([])
const loading = ref(false)
const dialog = useDialog()

async function fetchList() {
  loading.value = true
  try {
    rows.value = await recycleBinApi.list()
  } finally {
    loading.value = false
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false })
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))

async function restore(row: RecycleBinItem) {
  await recycleBinApi.restore(row.id)
  message.success(`已还原「${row.title}」`)
  await fetchList()
}

function purge(row: RecycleBinItem) {
  dialog.warning({
    title: '彻底删除',
    content: `彻底删除「${row.title}」后无法再还原（含纸质原件照片）。确定吗？`,
    positiveText: '彻底删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await recycleBinApi.purge(row.id)
      message.success('已彻底删除')
      await fetchList()
    },
  })
}

const columns: DataTableColumns<RecycleBinItem> = [
  { key: 'entityType', title: '类型', width: 90, render: (r) => (r.entityType === 'CUSTOMER' ? '客户' : '母婴档案') },
  { key: 'title', title: '名称', width: 200 },
  { key: 'summary', title: '一并删除的数据', render: (r) => r.summary || '（无）' },
  { key: 'deletedByName', title: '删除人', width: 100, render: (r) => r.deletedByName ?? '-' },
  { key: 'deletedAt', title: '删除时间', width: 170, render: (r) => fmt(r.deletedAt) },
  { key: 'expiresAt', title: '剩余保留', width: 100, render: (r) => `${daysLeft(r.expiresAt)} 天` },
  {
    key: 'actions',
    title: '操作',
    width: 170,
    fixed: 'right',
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', type: 'primary', onClick: () => restore(row) }, { default: () => '还原' }),
          h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => purge(row) }, { default: () => '彻底删除' }),
        ],
      }),
  },
]

onMounted(fetchList)
</script>

<template>
  <div>
    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      删除的客户、母婴档案会先放到这里，<b>保留 30 天</b>，期内可以一键还原（连同合同、入住、收款、档案等全部数据）；超过 30 天自动彻底清除。
    </n-alert>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: RecycleBinItem) => r.id" :scroll-x="900" />
  </div>
</template>
