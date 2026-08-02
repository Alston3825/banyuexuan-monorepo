<script setup lang="ts">
import { computed, ref } from 'vue'
import { NCard, NGrid, NGridItem, NStatistic, NSpace, NDatePicker, NSelect, NButton, NDataTable, NAlert, NEmpty, type DataTableColumns } from 'naive-ui'
import { businessReportApi } from '../../api/modules/analytics.api'
import { businessAnalyticsAgentApi } from '../../api/modules/ai.api'
import { storeApi } from '../../api/modules/store.api'
import type { FinanceSummary, OccupancySummary, PaymentByMethod, OccupancyDailyPoint } from '../../api/types/analytics'
import type { AiSuggestion } from '../../api/types/ai'
import type { Store } from '../../api/types/store'
import { PAYMENT_METHOD_LABEL_MAP } from '../../utils/status-map'
import { toMajorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'
import { extractErrorMessage } from '../../utils/error-message'

const ALL_STORES = ''

const stores = ref<Store[]>([])
const storeOptions = computed(() => [
  { label: '全部门店汇总（超级管理员可见，店长自动限定本店）', value: ALL_STORES },
  ...stores.value.map((s) => ({ label: s.name, value: s.id })),
])
const storeId = ref<string>(ALL_STORES)
const dateRange = ref<[number, number] | null>(null)

const financeSummary = ref<FinanceSummary | null>(null)
const occupancySummary = ref<OccupancySummary | null>(null)
const loading = ref(false)
const analyzing = ref(false)
const analysis = ref<AiSuggestion | null>(null)
const analyzeError = ref('')

/** n-date-picker 的 daterange 返回本地时区午夜的时间戳，用 toISOString() 会因转 UTC 偏移一天，需取本地日期分量。 */
function toDateParam(ts: number): string {
  const d = new Date(ts)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function fetchAll() {
  if (!dateRange.value) {
    message.error('请选择统计时间区间')
    return
  }
  const params = { storeId: storeId.value || undefined, startDate: toDateParam(dateRange.value[0]), endDate: toDateParam(dateRange.value[1]) }
  loading.value = true
  analysis.value = null
  try {
    const [finance, occupancy] = await Promise.all([businessReportApi.financeSummary(params), businessReportApi.occupancySummary(params)])
    financeSummary.value = finance
    occupancySummary.value = occupancy
  } finally {
    loading.value = false
  }
}

async function handleAnalyze() {
  analyzeError.value = ''
  if (!dateRange.value) {
    message.error('请选择统计时间区间')
    return
  }
  analyzing.value = true
  try {
    const result = await businessAnalyticsAgentApi.analyze({
      storeId: storeId.value || undefined,
      startDate: toDateParam(dateRange.value[0]),
      endDate: toDateParam(dateRange.value[1]),
    })
    financeSummary.value = result.financeSummary
    occupancySummary.value = result.occupancySummary
    analysis.value = result.suggestion
  } catch (error) {
    analyzeError.value = extractErrorMessage(error, 'AI暂时不可用，请稍后重试')
  } finally {
    analyzing.value = false
  }
}

const byMethodColumns: DataTableColumns<PaymentByMethod> = [
  { key: 'method', title: '支付方式', render: (row) => PAYMENT_METHOD_LABEL_MAP[row.method] ?? row.method },
  { key: 'amount', title: '金额（元）', render: (row) => toMajorUnits(row.amount) },
]

const dailyColumns: DataTableColumns<OccupancyDailyPoint> = [
  { key: 'date', title: '日期' },
  { key: 'occupiedRooms', title: '在住房间数' },
  { key: 'totalRooms', title: '房间总数' },
  { key: 'occupancyRate', title: '入住率', render: (row) => `${(row.occupancyRate * 100).toFixed(1)}%` },
]

storeApi.list().then((list) => (stores.value = list))
</script>

<template>
  <div>
    <n-space style="margin-bottom: 16px" :wrap="false">
      <n-select v-model:value="storeId" :options="storeOptions" style="width: 320px" />
      <n-date-picker v-model:value="dateRange" type="daterange" style="width: 280px" />
      <n-button type="primary" :loading="loading" @click="fetchAll">查询</n-button>
    </n-space>

    <n-empty v-if="!financeSummary" description="请选择时间区间后点击查询" />

    <template v-else>
      <n-card title="财务" style="margin-bottom: 16px">
        <n-grid :cols="5" :x-gap="12" style="margin-bottom: 16px">
          <n-grid-item><n-statistic label="收款总额（元）" :value="toMajorUnits(financeSummary.paymentTotalAmount) ?? 0" /></n-grid-item>
          <n-grid-item><n-statistic label="已退款（元）" :value="toMajorUnits(financeSummary.paymentRefundedAmount) ?? 0" /></n-grid-item>
          <n-grid-item><n-statistic label="会员充值（元）" :value="toMajorUnits(financeSummary.accountRechargeAmount) ?? 0" /></n-grid-item>
          <n-grid-item><n-statistic label="会员消费（元）" :value="toMajorUnits(financeSummary.accountConsumeAmount) ?? 0" /></n-grid-item>
          <n-grid-item><n-statistic label="会员当前总余额（元）" :value="toMajorUnits(financeSummary.accountCurrentBalance) ?? 0" /></n-grid-item>
        </n-grid>
        <n-data-table :columns="byMethodColumns" :data="financeSummary.paymentByMethod" :row-key="(r: PaymentByMethod) => r.method" size="small" />
      </n-card>

      <n-card title="房态" style="margin-bottom: 16px" v-if="occupancySummary">
        <n-grid :cols="3" :x-gap="12" style="margin-bottom: 16px">
          <n-grid-item><n-statistic label="房间总数" :value="occupancySummary.totalRooms" /></n-grid-item>
          <n-grid-item><n-statistic label="区间日均入住率" :value="`${(occupancySummary.averageOccupancyRate * 100).toFixed(1)}%`" /></n-grid-item>
          <n-grid-item><n-statistic label="统计范围" :value="occupancySummary.storeScope === 'ALL' ? '全租户汇总' : '本店'" /></n-grid-item>
        </n-grid>
        <n-data-table :columns="dailyColumns" :data="occupancySummary.daily" :row-key="(r: OccupancyDailyPoint) => r.date" size="small" :max-height="320" />
      </n-card>

      <n-card title="AI 经营分析解读">
        <n-alert type="info" :bordered="false" style="margin-bottom: 12px">分析仅供管理参考，不构成正式经营决策依据，最终决策需要管理者结合更多信息判断。</n-alert>
        <n-button type="primary" :loading="analyzing" @click="handleAnalyze" style="margin-bottom: 12px">生成AI经营解读</n-button>
        <n-alert v-if="analyzeError" type="error" closable style="margin-bottom: 12px" @close="analyzeError = ''">{{ analyzeError }}</n-alert>
        <div v-if="analysis" style="white-space: pre-wrap">{{ analysis.outputText }}</div>
      </n-card>
    </template>
  </div>
</template>
