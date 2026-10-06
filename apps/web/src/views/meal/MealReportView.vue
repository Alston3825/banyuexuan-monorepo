<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NCard, NGrid, NGridItem, NStatistic, NSpace, NDatePicker, NSelect, NButton, NDataTable, type DataTableColumns } from 'naive-ui'
import { mealRecordApi } from '../../api/modules/meal.api'
import { storeApi } from '../../api/modules/store.api'
import type { MealReport } from '../../api/types/meal'
import type { Store } from '../../api/types/store'
import { MEAL_SLOT_LABEL_MAP } from '../../utils/status-map'

const report = ref<MealReport | null>(null)
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const storeId = ref<string | null>(null)
const dateRange = ref<[number, number] | null>(null)

const bySlotRows = computed(() =>
  Object.entries(report.value?.bySlot ?? {}).map(([slot, count]) => ({ slot, label: MEAL_SLOT_LABEL_MAP[slot] ?? slot, count })),
)

async function fetchReport() {
  loading.value = true
  try {
    report.value = await mealRecordApi.report({
      storeId: storeId.value ?? undefined,
      startDate: dateRange.value ? new Date(dateRange.value[0]).toISOString().slice(0, 10) : undefined,
      endDate: dateRange.value ? new Date(dateRange.value[1]).toISOString().slice(0, 10) : undefined,
    })
  } finally {
    loading.value = false
  }
}

const byMealItemColumns: DataTableColumns<{ mealItemId: string; name: string; servedCount: number }> = [
  { key: 'name', title: '菜品' },
  { key: 'servedCount', title: '供餐份数' },
]

const bySlotColumns: DataTableColumns<{ slot: string; label: string; count: number }> = [
  { key: 'label', title: '餐次' },
  { key: 'count', title: '记录数' },
]

onMounted(async () => {
  stores.value = await storeApi.list()
  await fetchReport()
})
</script>

<template>
  <div>
    <n-space style="margin-bottom: 16px">
      <n-select v-model:value="storeId" :options="storeOptions" clearable placeholder="全部门店" style="width: min(180px, 94vw)" />
      <n-date-picker v-model:value="dateRange" type="daterange" clearable style="width: min(280px, 94vw)" />
      <n-button type="primary" :loading="loading" @click="fetchReport">查询</n-button>
    </n-space>

    <n-grid v-if="report" cols="2 s:3 m:5" responsive="screen" :x-gap="12" style="margin-bottom: 16px">
      <n-grid-item><n-card><n-statistic label="排餐总数" :value="report.totalRecords" /></n-card></n-grid-item>
      <n-grid-item><n-card><n-statistic label="已供餐" :value="report.servedCount" /></n-card></n-grid-item>
      <n-grid-item><n-card><n-statistic label="待供餐" :value="report.plannedCount" /></n-card></n-grid-item>
      <n-grid-item><n-card><n-statistic label="自选餐数" :value="report.customSelectedCount" /></n-card></n-grid-item>
      <n-grid-item><n-card><n-statistic label="平均评分" :value="report.avgRating ?? '-'" /></n-card></n-grid-item>
    </n-grid>

    <n-grid v-if="report" cols="1 s:2" responsive="screen" :x-gap="16">
      <n-grid-item>
        <n-card title="各餐次记录数">
          <n-data-table :columns="bySlotColumns" :data="bySlotRows" :row-key="(r) => r.slot" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="各菜品供餐份数（可作为食材用量预算的基础数据）">
          <n-data-table :columns="byMealItemColumns" :data="report.byMealItem" :row-key="(r) => r.mealItemId" />
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
