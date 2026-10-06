<script setup lang="ts">
/**
 * 护理统计：按指标 + 条件 + 日期范围，从日常护理记录里精确筛出符合的记录（例如“本月宝宝黄疸值 ≥ 12”），
 * 点客户名进入母婴档案，也可以导出 CSV。预设按钮只是方便点选，不是报警规则（异常报警阈值以后由护理团队给出再做）。
 */
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NDataTable, NDatePicker, NInputNumber, NSelect, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import { careStatsApi } from '../../api/modules/care-archive.api'
import type { StatMetric, StatRow } from '../../api/types/care-archive'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const metrics = ref<StatMetric[]>([])
const metric = ref<string | null>(null)
const op = ref('gte')
const value = ref<number | null>(null)
const range = ref<[number, number] | null>(null)
const rows = ref<StatRow[]>([])
const total = ref(0)
const truncated = ref(false)
const loading = ref(false)
const queried = ref(false)

const metricOptions = computed(() => [
  { type: 'group' as const, label: '宝宝', key: 'b', children: metrics.value.filter((m) => m.subject === 'BABY').map((m) => ({ label: m.label, value: m.code })) },
  { type: 'group' as const, label: '妈妈', key: 'm', children: metrics.value.filter((m) => m.subject === 'MOTHER').map((m) => ({ label: m.label, value: m.code })) },
])
const opOptions = [
  { label: '大于等于 ≥', value: 'gte' },
  { label: '大于 >', value: 'gt' },
  { label: '小于等于 ≤', value: 'lte' },
  { label: '小于 <', value: 'lt' },
  { label: '等于 =', value: 'eq' },
]
const current = computed(() => metrics.value.find((m) => m.code === metric.value) ?? null)
const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function setRange(days: number) {
  const end = Date.now()
  range.value = [end - days * 86400_000, end]
}
function preset(p: { op: string; value: number }) {
  op.value = p.op
  value.value = p.value
  void run()
}

async function run() {
  if (!metric.value) return message.warning('请先选择统计指标')
  if (value.value === null) return message.warning('请输入数值')
  loading.value = true
  try {
    const r = await careStatsApi.query({ metric: metric.value, op: op.value, value: value.value, from: range.value ? ymd(range.value[0]) : undefined, to: range.value ? ymd(range.value[1]) : undefined })
    rows.value = r.rows
    total.value = r.total
    truncated.value = r.truncated || r.total > r.rows.length
    queried.value = true
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const m = current.value
  if (!m || rows.value.length === 0) return
  const head = ['日期', '房号', '客户', '宝宝', `${m.label}${m.unit ? '(' + m.unit + ')' : ''}`]
  const lines = rows.value.map((r) => [r.date, r.roomNo ?? '', r.customerName, r.babyName ?? '', r.value].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `护理统计-${m.label}-${ymd(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

const columns: DataTableColumns<StatRow> = [
  { key: 'date', title: '日期', width: 110 },
  { key: 'roomNo', title: '房号', width: 80, render: (r) => r.roomNo ?? '-' },
  {
    key: 'customerName',
    title: '客户',
    width: 120,
    render: (r) => h('a', { style: 'color:#2a64b0;cursor:pointer;font-weight:600', onClick: () => router.push({ path: `/care/profiles/${r.motherProfileId}`, query: { tab: 'daily' } }) }, r.customerName),
  },
  { key: 'babyName', title: '宝宝', width: 120, render: (r) => r.babyName ?? '（妈妈）' },
  { key: 'value', title: () => (current.value ? `${current.value.label.replace(/（.*）/, '')}${current.value.unit ? '（' + current.value.unit + '）' : ''}` : '数值'), width: 140, render: (r) => h(NTag, { type: 'warning', size: 'small' }, { default: () => String(r.value) }) },
]

onMounted(async () => {
  metrics.value = await careStatsApi.metrics()
  setRange(30)
})
</script>

<template>
  <div>
    <p class="st-tip">从日常护理记录里按条件精确筛选数据。例如：选“宝宝黄疸值”，条件“≥ 12”，日期选本月，点查询。预设按钮只是方便点选，不是报警规则。</p>
    <n-space :wrap="true" align="center" style="margin-bottom: 10px">
      <n-select v-model:value="metric" :options="metricOptions" placeholder="选择统计指标" style="width: min(300px, 94vw)" />
      <n-select v-model:value="op" :options="opOptions" style="width: 130px" />
      <n-input-number v-model:value="value" :show-button="false" placeholder="数值" style="width: 110px" @keyup.enter="run" />
      <span v-if="current?.unit" class="st-unit">{{ current.unit }}</span>
    </n-space>
    <n-space :wrap="true" align="center" style="margin-bottom: 10px">
      <n-date-picker v-model:value="range" type="daterange" clearable style="width: min(300px, 94vw)" />
      <n-button size="small" @click="setRange(7)">近 7 天</n-button>
      <n-button size="small" @click="setRange(30)">近 30 天</n-button>
      <n-button size="small" @click="setRange(90)">近 90 天</n-button>
      <n-button type="primary" :loading="loading" @click="run">查询</n-button>
      <n-button :disabled="rows.length === 0" @click="exportCsv">导出 CSV</n-button>
    </n-space>
    <n-space v-if="current && current.presets.length" style="margin-bottom: 12px" align="center">
      <span class="st-unit">常用条件：</span>
      <n-button v-for="p in current.presets" :key="p.label" size="tiny" secondary type="info" @click="preset(p)">{{ p.label }}</n-button>
    </n-space>

    <div v-if="queried" class="st-sum">
      共 <b>{{ total }}</b> 条符合{{ truncated ? '（只显示前 1000 条，请缩小日期范围）' : '' }}
    </div>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: StatRow) => r.motherProfileId + r.date + (r.babyName ?? '') + r.value" :scroll-x="580" :pagination="{ pageSize: 20 }">
      <template #empty>{{ queried ? '没有符合条件的记录' : '选择指标和条件后点“查询”' }}</template>
    </n-data-table>
  </div>
</template>

<style scoped>
.st-tip {
  margin: 0 0 12px;
  color: #888;
  font-size: 13px;
  line-height: 1.6;
}
.st-unit {
  color: #888;
  font-size: 13px;
}
.st-sum {
  margin: 4px 0 8px;
  font-size: 14px;
}
</style>
