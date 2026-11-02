<script setup lang="ts">
/** 满意度统计分析：各评分项的平均分/满意率/分值分布，得分最低的项目，按月趋势，按管家对比（只统计已确认的调查）。 */
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NDatePicker, NEmpty, NInput, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { satisfactionApi } from '../../api/modules/satisfaction.api'
import type { SurveyStats } from '../../api/types/satisfaction'

const props = defineProps<{ formOptions: { label: string; value: string }[] }>()
const emit = defineEmits<{ (e: 'goPending'): void }>()

const templateId = ref<string | null>(null)
const range = ref<[number, number] | null>(null)
const steward = ref('')
const data = ref<SurveyStats | null>(null)
const loading = ref(false)

const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const filter = computed(() => ({ templateId: templateId.value ?? undefined, from: range.value ? ymd(range.value[0]) : undefined, to: range.value ? ymd(range.value[1]) : undefined, steward: steward.value.trim() || undefined }))

let seq = 0
async function load() {
  const my = ++seq
  loading.value = true
  try {
    const res = await satisfactionApi.stats(filter.value)
    if (my === seq) data.value = res
  } finally {
    if (my === seq) loading.value = false
  }
}
let t: ReturnType<typeof setTimeout> | null = null
watch([templateId, range, steward], () => {
  if (t) clearTimeout(t)
  t = setTimeout(load, 300)
})
onMounted(load)
defineExpose({ reload: load })

const pct = (n: number, total: number) => (total ? (n / total) * 100 : 0)
const color = (avg: number | null) => (avg === null ? '#bbb' : avg >= 10 ? '#18a058' : avg <= 6 ? '#d03050' : '#f0a020')
const nameOf = (id: string) => props.formOptions.find((o) => o.value === id)?.label ?? ''
</script>

<template>
  <div>
    <n-space style="margin-bottom: 12px" align="center" :wrap="true">
      <n-select v-model:value="templateId" :options="formOptions" clearable placeholder="全部调查表" style="width: min(200px, 94vw)" />
      <n-date-picker v-model:value="range" type="daterange" clearable style="width: min(300px, 94vw)" />
      <n-input v-model:value="steward" clearable placeholder="按管家姓名筛选" style="width: min(180px, 94vw)" />
    </n-space>

    <n-spin :show="loading">
      <template v-if="data">
        <div class="st-tiles">
          <div class="st-tile"><div class="st-num">{{ data.total }}</div><div class="st-cap">已统计的调查表</div></div>
          <div v-for="f in data.forms" :key="f.templateId" class="st-tile">
            <div class="st-num" :style="{ color: color(f.avg) }">{{ f.avg ?? '-' }}<small> / {{ data.scoreMax }}</small></div>
            <div class="st-cap">{{ f.title }} · {{ f.count }} 份 · 满意率 {{ f.satisfiedRate === null ? '-' : f.satisfiedRate + '%' }}</div>
          </div>
          <div v-if="data.pending > 0" class="st-tile st-pending" @click="emit('goPending')">
            <div class="st-num">{{ data.pending }}</div>
            <div class="st-cap">份待核对，没计入统计 →</div>
          </div>
        </div>
        <div class="st-note">分值 0~{{ data.scoreMax }}，越高越满意；≥10 算“满意”，7~9 “一般”，≤6 “不满意”。</div>

        <n-empty v-if="data.total === 0" description="还没有已确认的调查。上传纸质表、核对后点“确认并计入统计”，这里就有数据了" style="margin: 30px 0" />

        <template v-else>
          <div v-if="data.lowItems.length" class="st-card">
            <div class="st-h">最需要关注：得分最低的 5 项</div>
            <div v-for="(it, i) in data.lowItems" :key="it.key" class="st-low">
              <span class="st-rank">{{ i + 1 }}</span>
              <span class="st-lbl">{{ it.label }}<small>（{{ it.formTitle }} · {{ it.groupTitle }}）</small></span>
              <b :style="{ color: color(it.avg) }">{{ it.avg }}</b>
            </div>
          </div>

          <div v-for="f in data.forms.filter((x) => x.count > 0)" :key="f.templateId" class="st-card">
            <div class="st-h">{{ f.title }}<span v-if="f.day">（住满第 {{ f.day }} 天）</span> · {{ f.count }} 份 · 平均 <b :style="{ color: color(f.avg) }">{{ f.avg }}</b> 分</div>
            <template v-for="g in f.groups" :key="g.key">
              <div class="st-g">{{ g.title }}<span v-if="g.avg !== null"> · 平均 {{ g.avg }}</span></div>
              <div v-for="it in g.items" :key="it.key" class="st-item">
                <div class="st-lbl">{{ it.label }}</div>
                <div class="st-bars">
                  <div class="st-bar" :title="`平均 ${it.avg ?? '-'} 分`"><i :style="{ width: pct(it.avg ?? 0, data.scoreMax) + '%', background: color(it.avg) }" /></div>
                  <b class="st-avg" :style="{ color: color(it.avg) }">{{ it.avg ?? '-' }}</b>
                </div>
                <div class="st-dist" v-if="it.count">
                  <span class="d-good" :style="{ flex: it.good || 0.001 }" v-if="it.good">满意 {{ it.good }}</span>
                  <span class="d-mid" :style="{ flex: it.mid || 0.001 }" v-if="it.mid">一般 {{ it.mid }}</span>
                  <span class="d-bad" :style="{ flex: it.bad || 0.001 }" v-if="it.bad">不满意 {{ it.bad }}</span>
                </div>
                <div v-else class="st-sub">没有人回答这一项</div>
              </div>
            </template>
          </div>

          <div v-if="data.trend.length" class="st-card">
            <div class="st-h">按月趋势（平均分）</div>
            <div class="st-trend">
              <div v-for="t in data.trend" :key="t.month + t.templateId" class="st-tchip"><span>{{ t.month }}</span><n-tag size="small" :bordered="false">{{ nameOf(t.templateId) }}</n-tag><b :style="{ color: color(t.avg) }">{{ t.avg }}</b></div>
            </div>
          </div>

          <div v-if="data.staff.length" class="st-card">
            <div class="st-h">按管家对比（所有评分项的平均分）</div>
            <div v-for="s in data.staff" :key="s.name" class="st-low"><span class="st-lbl">{{ s.name }}<small>（{{ s.surveys }} 份）</small></span><b :style="{ color: color(s.avg) }">{{ s.avg }}</b></div>
            <div class="st-sub">份数较少时仅供参考，不要据此直接评判个人。</div>
          </div>
        </template>
      </template>
    </n-spin>
    <n-button v-if="false" />
  </div>
</template>

<style scoped>
.st-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.st-tile {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
}
.st-pending {
  cursor: pointer;
  border-color: #f0a020;
}
.st-num {
  font-size: 26px;
  font-weight: 700;
}
.st-num small {
  font-size: 13px;
  font-weight: 400;
  color: #888;
}
.st-cap,
.st-sub,
.st-note {
  font-size: 12px;
  color: #888;
}
.st-note {
  margin: 8px 0 12px;
}
.st-card {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 14px;
}
.st-h {
  font-weight: 700;
  margin-bottom: 8px;
}
.st-g {
  margin: 10px 0 4px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.14);
  font-weight: 600;
  font-size: 13px;
}
.st-item {
  padding: 6px 0;
  border-bottom: 1px dashed rgba(128, 128, 128, 0.25);
}
.st-lbl small {
  color: #888;
  margin-left: 4px;
}
.st-bars {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}
.st-bar {
  flex: 1;
  height: 10px;
  border-radius: 5px;
  background: rgba(128, 128, 128, 0.2);
  overflow: hidden;
}
.st-bar i {
  display: block;
  height: 100%;
}
.st-avg {
  min-width: 36px;
  text-align: right;
}
.st-dist {
  display: flex;
  gap: 2px;
  font-size: 11px;
  color: #fff;
}
.st-dist span {
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
}
.d-good {
  background: #18a058;
}
.d-mid {
  background: #f0a020;
}
.d-bad {
  background: #d03050;
}
.st-low {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(128, 128, 128, 0.25);
}
.st-low .st-lbl {
  flex: 1;
}
.st-rank {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #d03050;
  color: #fff;
  text-align: center;
  font-size: 12px;
  line-height: 20px;
}
.st-trend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.st-tchip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 13px;
}
</style>
