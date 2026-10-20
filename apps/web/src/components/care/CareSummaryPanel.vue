<script setup lang="ts">
/**
 * 出所护理小结：把住店期间的入所/出所评估、日常记录汇总（体重/黄疸变化、平均奶量、二便）、用药委托、
 * 护理计划调整过程、服务执行次数自动汇总成一份，可以打印或存成 PDF 给家属。数据全部来自系统里已录入的内容。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NEmpty, NSpace, NSpin } from 'naive-ui'
import { careServiceLogApi, careStatsApi } from '../../api/modules/care-archive.api'
import { CARE_LEVEL_LABEL, PLAN_SOURCE_LABEL, PLAN_STATUS_LABEL, type CareLevelCode, type CareSummary, type PlanSource, type PlanStatus } from '../../api/types/care-archive'
import { DELIVERY_METHOD_LABEL_MAP, BABY_GENDER_LABEL_MAP } from '../../utils/status-map'

const props = defineProps<{ motherProfileId: string }>()
const data = ref<CareSummary | null>(null)
const serviceLine = ref('')
const loading = ref(false)

const d = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')
const n = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '-' : `${v}${unit}`)
const lvl = (l: string) => CARE_LEVEL_LABEL[l as CareLevelCode] ?? l
const diff = (a: number | null | undefined, b: number | null | undefined, unit = '') => (typeof a === 'number' && typeof b === 'number' ? `${b - a >= 0 ? '+' : ''}${Math.round((b - a) * 100) / 100}${unit}` : '-')
const trend = (t: { date: string; v: number }[]) => (t.length ? t.map((x) => `${x.date.slice(5)} ${x.v}`).join(' → ') : '-')
const motherMethod = computed(() => (data.value ? DELIVERY_METHOD_LABEL_MAP[data.value.delivery.method as keyof typeof DELIVERY_METHOD_LABEL_MAP] ?? data.value.delivery.method : ''))

const printPage = () => window.print()

async function load() {
  loading.value = true
  try {
    data.value = await careStatsApi.summary(props.motherProfileId)
    const s = await careServiceLogApi.summary(props.motherProfileId)
    const items = s.rows.filter((r) => r.group === 'ITEM' && r.done > 0)
    serviceLine.value = items.map((r) => `${r.name}${r.babyLabel ? '(' + r.babyLabel.split('：')[0] + ')' : ''} ${r.done} 次`).join('，')
  } finally {
    loading.value = false
  }
}
onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <n-spin :show="loading">
    <n-space style="margin-bottom: 10px" class="no-print">
      <n-button type="primary" size="small" @click="load">刷新汇总</n-button>
      <n-button size="small" @click="printPage">🖨 打印 / 存为 PDF</n-button>
      <span class="cs-hint">数据来自系统里已录入的评估、日常记录、用药、计划和服务执行；没录的项显示“-”。</span>
    </n-space>

    <div v-if="data" class="cs-page">
      <h2 class="cs-title">伴月轩月子中心 · 出所护理小结</h2>
      <div class="cs-grid">
        <div><b>客户：</b>{{ data.customerName }}</div>
        <div><b>房号：</b>{{ data.roomNo ?? '-' }}</div>
        <div><b>住店：</b>{{ d(data.stay.start) }} ~ {{ d(data.stay.end) }}（{{ data.stay.days ?? '-' }} 天）</div>
        <div><b>分娩：</b>{{ motherMethod }}，{{ d(data.delivery.date) }}，孕 {{ n(data.delivery.weeks, ' 周') }}</div>
      </div>

      <h3 class="cs-h">一、妈妈</h3>
      <table class="cs-t">
        <tr><th></th><th>体重</th><th>血压</th><th>体温</th><th>其他</th></tr>
        <tr><td>入所</td><td>{{ n(data.mother.admission?.weightKg, ' kg') }}</td><td>{{ data.mother.admission?.bp ?? '-' }}</td><td>{{ n(data.mother.admission?.temperature, ' ℃') }}</td><td class="cs-left">{{ data.mother.admission?.handlingNotes ?? '-' }}</td></tr>
        <tr><td>出所</td><td>{{ n(data.mother.discharge?.weightKg, ' kg') }}</td><td>{{ data.mother.discharge?.bp ?? '-' }}</td><td>{{ n(data.mother.discharge?.temperature, ' ℃') }}</td><td class="cs-left">{{ data.mother.discharge?.otherSpecial ?? '-' }}</td></tr>
        <tr><td>变化</td><td>{{ diff(data.mother.admission?.weightKg, data.mother.discharge?.weightKg, ' kg') }}</td><td colspan="3" class="cs-left">住店期间日常记录 {{ data.mother.daily.recordedDays }} 天：平均体温 {{ n(data.mother.daily.avgTemperature, ' ℃') }}，血压最高 {{ n(data.mother.daily.maxSystolic) }}/{{ n(data.mother.daily.maxDiastolic) }}</td></tr>
      </table>
      <div v-if="data.mother.discharge?.tips" class="cs-tip"><b>出所温馨提示：</b>{{ data.mother.discharge.tips }}</div>

      <template v-for="b in data.babies" :key="b.id">
        <h3 class="cs-h">二、{{ b.label }}（{{ BABY_GENDER_LABEL_MAP[b.gender] ?? b.gender }}，出生 {{ d(b.birthDate) }}）</h3>
        <table class="cs-t">
          <tr><th></th><th>体重</th><th>身长</th><th>头围</th><th>黄疸值(最高)</th></tr>
          <tr><td>入所</td><td>{{ n(b.admission?.weightG, ' g') }}</td><td>{{ n(b.admission?.lengthCm, ' cm') }}</td><td>{{ n(b.admission?.headCm, ' cm') }}</td><td>{{ n(b.admission?.jaundice) }}</td></tr>
          <tr><td>出所</td><td>{{ n(b.discharge?.weightG, ' g') }}</td><td>{{ n(b.discharge?.lengthCm, ' cm') }}</td><td>{{ n(b.discharge?.headCm, ' cm') }}</td><td>{{ n(b.discharge?.jaundice) }}</td></tr>
          <tr><td>增长</td><td>{{ diff(b.admission?.weightG ?? null, b.discharge?.weightG, ' g') }}</td><td>{{ diff(b.admission?.lengthCm, b.discharge?.lengthCm, ' cm') }}</td><td>{{ diff(b.admission?.headCm, b.discharge?.headCm, ' cm') }}</td><td>—</td></tr>
        </table>
        <div class="cs-line"><b>住店日常记录 {{ b.daily.recordedDays }} 天：</b>平均每天奶粉 {{ n(b.daily.avgFormulaMlPerDay, ' ml') }}，小便 {{ n(b.daily.avgUrinePerDay, ' 次') }}，大便 {{ n(b.daily.avgStoolPerDay, ' 次') }}；黄疸最高 {{ n(b.daily.jaundiceMax) }}</div>
        <div class="cs-line"><b>黄疸变化：</b>{{ trend(b.daily.jaundiceTrend) }}</div>
        <div class="cs-line"><b>体重变化(g)：</b>{{ trend(b.daily.weightTrend) }}</div>
        <div v-if="b.medications.length" class="cs-line">
          <b>用药委托：</b>
          <span v-for="(m, i) in b.medications" :key="i">{{ d(m.authDate) }}（{{ m.status === 'ACTIVE' ? '有效' : m.status === 'STOPPED' ? '已停药' : '已替换' }}）{{ m.items.join('、') }}{{ m.changeNote ? '，变更：' + m.changeNote : '' }}{{ m.stopNote ? '，停药：' + m.stopNote : '' }}；</span>
        </div>
        <div v-if="b.plans.length" class="cs-line"><b>护理计划：</b><span v-for="p in b.plans" :key="p.versionNo">第 {{ p.versionNo }} 版 {{ lvl(p.level) }}（{{ PLAN_STATUS_LABEL[p.status as PlanStatus] ?? p.status }}）；</span></div>
        <div v-if="b.discharge?.tips" class="cs-tip"><b>出所温馨提示：</b>{{ b.discharge.tips }}</div>
      </template>

      <h3 class="cs-h">三、妈妈护理计划调整过程</h3>
      <div v-if="data.motherPlans.length === 0" class="cs-line">未制定个人化护理计划。</div>
      <div v-for="p in data.motherPlans" :key="p.versionNo" class="cs-line">
        第 {{ p.versionNo }} 版 · {{ lvl(p.level) }} · {{ PLAN_SOURCE_LABEL[p.source as PlanSource] ?? p.source }} · {{ PLAN_STATUS_LABEL[p.status as PlanStatus] ?? p.status }} · 生效 {{ d(p.effectiveAt) }}
        <span v-if="p.focusPoints">；重点：{{ p.focusPoints }}</span><span v-if="p.progressNote">；阶段结果：{{ p.progressNote }}</span><span v-if="p.adjustReason">；调整原因：{{ p.adjustReason }}</span>
      </div>

      <h3 class="cs-h">四、护理服务执行</h3>
      <div class="cs-line">{{ serviceLine || '暂无服务执行记录' }}</div>
      <div class="cs-line">住店期间护理异常记录 {{ data.abnormalityCount }} 条。</div>
      <div class="cs-foot">生成时间：{{ data.generatedAt.slice(0, 16).replace('T', ' ') }}　护理师签字：__________　客户签字：__________</div>
    </div>
    <n-empty v-else-if="!loading" description="暂无数据" />
  </n-spin>
</template>

<style scoped>
.cs-hint {
  color: #999;
  font-size: 12px;
}
.cs-page {
  max-width: 900px;
  padding: 12px 4px;
}
.cs-title {
  margin: 0 0 10px;
  text-align: center;
  font-size: 18px;
}
.cs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 4px 12px;
  font-size: 14px;
}
.cs-h {
  margin: 16px 0 6px;
  padding-left: 8px;
  border-left: 3px solid #d9822b;
  font-size: 15px;
}
.cs-t {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.cs-t th,
.cs-t td {
  padding: 5px 8px;
  border: 1px solid #ddd;
  text-align: center;
}
.cs-t th {
  background: #f5f7fa;
}
.cs-left {
  text-align: left !important;
}
.cs-line,
.cs-tip {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.7;
}
.cs-tip {
  padding: 6px 8px;
  background: #fff7e0;
  border-radius: 4px;
}
.cs-foot {
  margin-top: 24px;
  color: #666;
  font-size: 13px;
}
@media (max-width: 720px) {
  .cs-t {
    font-size: 12px;
  }
}
@media print {
  .no-print {
    display: none !important;
  }
}
</style>

<style>
/* 打印出所护理小结：隐藏左侧菜单和顶栏，只留小结本身 */
@media print {
  .n-layout-sider,
  .n-layout-header,
  .n-tabs-nav,
  .n-breadcrumb {
    display: none !important;
  }
  .n-layout-scroll-container,
  .n-layout-content {
    overflow: visible !important;
    height: auto !important;
  }
}
</style>
