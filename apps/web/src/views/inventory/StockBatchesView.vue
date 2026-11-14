<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { NSpace, NDataTable, NSelect, NSwitch, NInputNumber, NInput, NTag, type DataTableColumns } from 'naive-ui'
import { stockBatchApi, warehouseApi } from '../../api/modules/inventory.api'
import { itemMatches } from '../../utils/item-search'
import type { StockBatch, StockBatchExpiryAlert } from '../../api/types/inventory'

const rows = ref<(StockBatch | StockBatchExpiryAlert)[]>([])
const warehouses = ref<{ id: string; name: string }[]>([])
const loading = ref(false)

const warehouseId = ref<string | null>(null)
const expiryOnly = ref(false)
const withinDays = ref(7)
const keyword = ref('')
const shown = computed(() => rows.value.filter((r) => itemMatches(r.item, keyword.value) || (keyword.value.trim() !== '' && (r.batchNo ?? '').toLowerCase().includes(keyword.value.trim().toLowerCase()))))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))

async function fetchList() {
  loading.value = true
  try {
    const params = { warehouseId: warehouseId.value ?? undefined }
    rows.value = expiryOnly.value ? await stockBatchApi.expiryAlerts({ ...params, withinDays: withinDays.value }) : await stockBatchApi.list(params)
  } finally {
    loading.value = false
  }
}

function isAlertRow(row: StockBatch | StockBatchExpiryAlert): row is StockBatchExpiryAlert {
  return 'isExpired' in row
}

const columns: DataTableColumns<StockBatch | StockBatchExpiryAlert> = [
  { key: 'warehouse', title: '仓库', render: (row) => row.warehouse.name },
  { key: 'item', title: '物品', render: (row) => row.item.name },
  { key: 'batchNo', title: '批次号' },
  { key: 'unitCost', title: '入库单价（元）', width: 110, render: (row) => (row.unitCost / 100).toFixed(2) },
  { key: 'sourceNo', title: '来源入库单', width: 150, render: (row) => (row as StockBatch).sourceNo ?? '-' },
  { key: 'quantity', title: '剩余数量', render: (row) => `${row.quantity} ${row.item.unit}` },
  { key: 'receivedAt', title: '入库时间', render: (row) => new Date(row.receivedAt).toLocaleDateString() },
  { key: 'expiresAt', title: '到期日期', render: (row) => (row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '不追踪') },
  {
    key: 'status',
    title: '状态',
    render: (row) => {
      if (!isAlertRow(row)) return '-'
      return h(NTag, { size: 'small', type: row.isExpired ? 'error' : 'warning' }, { default: () => (row.isExpired ? '已过期' : '临期') })
    },
  },
]

onMounted(async () => {
  warehouses.value = await warehouseApi.list()
  await fetchList()
})
watch([warehouseId, expiryOnly, withinDays], fetchList)
</script>

<template>
  <div>
    <n-space style="margin-bottom: 12px" align="center" :wrap="true">
      <n-input v-model:value="keyword" clearable placeholder="🔍 搜索物品（名称 / 规格 / 拼音首字母）或批次号" style="width: min(340px, 94vw)" />
      <n-select v-model:value="warehouseId" :options="warehouseOptions" clearable placeholder="全部仓库" style="width: min(220px, 94vw)" />
      <n-space align="center" :size="8">
        <n-switch v-model:value="expiryOnly" />
        <span>只看过期预警</span>
      </n-space>
      <n-space v-if="expiryOnly" align="center" :size="8">
        <span>临期天数</span>
        <n-input-number v-model:value="withinDays" :min="1" style="width: min(100px, 94vw)" />
      </n-space>
    </n-space>
    <n-data-table :columns="columns" :data="shown" :loading="loading" :row-key="(r) => r.id" :scroll-x="1100" />
  </div>
</template>
