<script setup lang="ts">
/**
 * 母婴档案里的“服务执行”：对应纸质《产妇常规护理计划》——护理项目（会阴护理、理疗、按摩子宫、各类查房、中药洗头泡脚、床品更换…）
 * 和宣教项目（带护理员/客户签名）。每做一次点“＋记一次”，“共 N 次”和每次的日期由系统数出来；
 * 同时按护理等级的标准频次和入住天数算出“应做几次”，没做够的标红提醒。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NDatePicker, NEmpty, NInput, NInputNumber, NModal, NSpace, NSpin, NSwitch, NTag, NTimePicker } from 'naive-ui'
import { careServiceLogApi } from '../../api/modules/care-archive.api'
import { CARE_LEVEL_LABEL, type ServiceRow, type ServiceSummary } from '../../api/types/care-archive'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'

const props = defineProps<{ motherProfileId: string }>()
const auth = useAuthStore()
const nurse = computed(() => (auth.account as { realName?: string } | null)?.realName ?? '')

const data = ref<ServiceSummary | null>(null)
const loading = ref(false)
const form = ref<{ row: ServiceRow; date: number; time: number; by: string; signed: boolean; note: string; systolic: number | null; diastolic: number | null; weightKg: number | null } | null>(null)
const saving = ref(false)

const groups = computed(() => {
  const rows = data.value?.rows ?? []
  return [
    { title: '妈妈护理项目', rows: rows.filter((r) => r.subject === 'MOTHER' && r.group === 'ITEM') },
    { title: '宝宝护理项目', rows: rows.filter((r) => r.subject === 'BABY' && r.group === 'ITEM') },
    { title: '宣教项目（做完请客户签字）', rows: rows.filter((r) => r.group === 'EDU') },
  ].filter((g) => g.rows.length > 0)
})

async function load() {
  loading.value = true
  try {
    data.value = await careServiceLogApi.summary(props.motherProfileId)
  } finally {
    loading.value = false
  }
}
const short = (r: ServiceRow) => r.expected !== null && r.done < r.expected
const ymdOf = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const hmOf = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const open = (row: ServiceRow) =>
  (form.value = { row, date: Date.now(), time: Date.now(), by: nurse.value, signed: row.group === 'EDU', note: '', systolic: null, diastolic: null, weightKg: null })

/** 一次记录的数值文字：血压“120/80”，体重“52.3kg”，其余项目没有数值 */
function valueText(l: ServiceRow['logs'][number]): string {
  if (l.systolic !== null && l.diastolic !== null) return `${l.systolic}/${l.diastolic}`
  if (l.weightKg !== null) return `${l.weightKg}kg`
  return ''
}
function chipTitle(l: ServiceRow['logs'][number]): string {
  return `${l.date} ${l.time ?? ''} ${valueText(l)} ${l.doneByName ?? ''}${l.clientSigned ? ' · 客户已签' : ''}${l.note ? ' · ' + l.note : ''}（点一下可删除）`.replace(/\s+/g, ' ')
}

async function save() {
  const f = form.value
  if (!f) return
  if (f.row.measure === 'BP' && (f.systolic === null || f.diastolic === null)) return void message.warning('请填写收缩压和舒张压')
  if (f.row.measure === 'WEIGHT' && f.weightKg === null) return void message.warning('请填写体重')
  saving.value = true
  try {
    await careServiceLogApi.create({
      motherProfileId: props.motherProfileId,
      babyProfileId: f.row.babyProfileId,
      serviceCode: f.row.code,
      doneDate: ymdOf(f.date),
      doneTime: hmOf(f.time),
      ...(f.row.measure === 'BP' ? { systolic: f.systolic!, diastolic: f.diastolic! } : {}),
      ...(f.row.measure === 'WEIGHT' ? { weightKg: f.weightKg! } : {}),
      doneByName: f.by,
      clientSigned: f.signed,
      note: f.note,
    })
    message.success('已记录')
    form.value = null
    await load()
  } finally {
    saving.value = false
  }
}
function removeLog(row: ServiceRow, l: ServiceRow['logs'][number]) {
  dialog.warning({
    title: `删除 ${md(l.date)} 的“${row.name}”记录？`,
    content: '删除后这一次不再计入“已做次数”。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await careServiceLogApi.remove(l.id)
      await load()
    },
  })
}

onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <n-spin :show="loading">
    <n-card v-if="data" size="small" style="margin-bottom: 12px">
      <div class="sl-top">
        入住第 <b>{{ data.stayDay }}</b> 天 · 妈妈护理等级：<n-tag size="small" type="info">{{ CARE_LEVEL_LABEL[data.motherLevel] }}</n-tag>
        <span class="sl-sub">频次按护理等级的标准计算；等级在“护理计划”里由护理长制定、护理主任审核。</span>
      </div>
    </n-card>

    <n-space vertical :size="12">
      <n-card v-for="g in groups" :key="g.title" size="small" :title="g.title">
        <div v-for="r in g.rows" :key="r.code + (r.babyProfileId ?? '')" class="sl-row">
          <div class="sl-head">
            <b>{{ r.name }}</b>
            <span v-if="r.babyLabel" class="sl-baby">👶 {{ r.babyLabel }}</span>
            <span class="sl-freq">{{ r.freqText }}</span>
            <n-tag size="tiny" :type="short(r) ? 'error' : 'success'" round>
              已做 {{ r.done }}{{ r.expected !== null ? ` / 应 ${r.expected}` : '' }} 次
            </n-tag>
            <n-button size="tiny" type="primary" secondary @click="open(r)">＋ 记一次</n-button>
          </div>
          <div v-if="r.logs.length > 0" class="sl-logs">
            <span v-for="l in r.logs" :key="l.id" class="sl-chip" :class="{ 'sl-chip-val': !!valueText(l) }" :title="chipTitle(l)" @click="removeLog(r, l)">
              {{ md(l.date) }}<span v-if="l.time" class="sl-time">{{ l.time }}</span><b v-if="valueText(l)" class="sl-val">{{ valueText(l) }}</b><span v-if="l.clientSigned" class="sl-sign">✍</span>
            </span>
          </div>
        </div>
      </n-card>
      <n-empty v-if="data && groups.length === 0" description="没有服务项目" />
    </n-space>

    <n-modal :show="!!form" @update:show="(v) => !v && (form = null)">
      <n-card v-if="form" :title="`记一次：${form.row.name}${form.row.babyLabel ? '（' + form.row.babyLabel + '）' : ''}`" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-space vertical :size="10">
          <div class="sl-two">
            <div><div class="sl-lab">日期</div><n-date-picker v-model:value="form.date" type="date" style="width: 100%" :is-date-disabled="(ts: number) => ts > Date.now()" /></div>
            <div><div class="sl-lab">时间</div><n-time-picker v-model:value="form.time" format="HH:mm" :actions="['now', 'confirm']" style="width: 100%" /></div>
          </div>
          <div v-if="form.row.measure === 'BP'" class="sl-two">
            <div><div class="sl-lab">收缩压（高压）mmHg</div><n-input-number v-model:value="form.systolic" :min="60" :max="260" :precision="0" :show-button="false" placeholder="如 120" style="width: 100%" /></div>
            <div><div class="sl-lab">舒张压（低压）mmHg</div><n-input-number v-model:value="form.diastolic" :min="30" :max="160" :precision="0" :show-button="false" placeholder="如 80" style="width: 100%" /></div>
          </div>
          <div v-if="form.row.measure === 'WEIGHT'"><div class="sl-lab">体重 kg</div><n-input-number v-model:value="form.weightKg" :min="30" :max="200" :precision="2" :show-button="false" placeholder="如 58.5" style="width: 100%" /></div>
          <div><div class="sl-lab">护理员/查房人</div><n-input v-model:value="form.by" /></div>
          <div v-if="form.row.group === 'EDU'" class="sl-sw"><n-switch v-model:value="form.signed" /> 客户已签字</div>
          <div><div class="sl-lab">备注</div><n-input v-model:value="form.note" /></div>
        </n-space>
        <template #footer>
          <n-space justify="end"><n-button @click="form = null">取消</n-button><n-button type="primary" :loading="saving" @click="save">保存</n-button></n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.sl-top {
  font-size: 14px;
}
.sl-sub {
  display: block;
  margin-top: 4px;
  color: #999;
  font-size: 12px;
}
.sl-row {
  padding: 8px 0;
  border-bottom: 1px dashed #eee;
}
.sl-row:last-child {
  border-bottom: none;
}
.sl-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sl-freq {
  color: #888;
  font-size: 12px;
}
.sl-baby {
  color: #2a64b0;
  font-size: 12px;
}
.sl-logs {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sl-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: #eef5fc;
  color: #2a64b0;
  font-size: 12px;
  cursor: pointer;
}
.sl-chip-val {
  background: #fdf3e6;
  color: #a85d0c;
}
.sl-time {
  margin-left: 5px;
}
.sl-val {
  margin-left: 6px;
}
.sl-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.sl-sign {
  margin-left: 3px;
  color: #2a8a3e;
}
.sl-lab {
  margin-bottom: 3px;
  color: #666;
  font-size: 12px;
}
.sl-sw {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
