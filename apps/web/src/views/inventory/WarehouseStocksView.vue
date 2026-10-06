<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NSpace, NDataTable, NSelect, NSwitch, type DataTableColumns } from 'naive-ui'
import { warehouseStockApi, warehouseApi } from '../../api/modules/inventory.api'
import type { WarehouseStock } from '../../api/types/inventory'

const rows = ref<WarehouseStock[]>([])
const warehouses = ref<{ id: string; name: string }[]>([])
const loading = ref(false)

const warehouseId = ref<string | null>(null)
const lowStockOnly = ref(false)
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))

async function fetchList() {
  loading.value = true
  try {
    const params = { warehouseId: warehouseId.value ?? undefined }
    rows.value = lowStockOnly.value ? await warehouseStockApi.lowStockAlerts(params) : await warehouseStockApi.list(params)
  } finally {
    loading.value = false
  }
}

const columns: DataTableColumns<WarehouseStock> = [
  { key: 'warehouse', title: '仓库', render: (row) => row.warehouse.name },
  { key: 'item', title: '物品', render: (row) => row.item.name },
  { key: 'quantity', title: '当前数量', render: (row) => `${row.quantity} ${row.item.unit}` },
  { key: 'safetyStockThreshold', title: '安全库存阈值', render: (row) => row.item.safetyStockThreshold ?? '-' },
  { key: 'avgCost', title: '移动加权平均成本(分)', render: (row) => row.avgCost },
  { key: 'updatedAt', title: '更新时间', render: (row) => new Date(row.updatedAt).toLocaleString() },
]

onMounted(async () => {
  warehouses.value = await warehouseApi.list()
  await fetchList()
})
watch([warehouseId, lowStockOnly], fetchList)
</script>

<template>
  <div>
    <n-space style="margin-bottom: 12px">
      <n-select v-model:value="warehouseId" :options="warehouseOptions" clearable placeholder="全部仓库" style="width: min(220px, 94vw)" />
      <n-space align="center" :size="8">
        <n-switch v-model:value="lowStockOnly" />
        <span>只看低库存预警</span>
      </n-space>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: WarehouseStock) => r.id" :scroll-x="900" />
  </div>
</template>
