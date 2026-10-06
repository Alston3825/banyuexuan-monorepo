<script setup lang="ts">
/**
 * 宝宝 24 小时喂养记录单的录入表：每一行是一次喂养/排泄，做成"卡片行"——手机上一行一张卡，
 * 点“＋ 添加一次”自动带上当前时间，奶量等用数字键盘输入；大便打勾后才展开颜色/量/性状。
 * 表头下面的汇总（奶粉总量、小便次数、大便次数）自动算，不用手写。
 * AI 识别时两次读图不一致的格子（warnings 里 field 形如 feedings.2.formulaMl）会标黄。
 */
import { computed } from 'vue'
import { NButton, NInput, NInputNumber } from 'naive-ui'
import type { ActiveMedication, ExtractWarning, FeedingEntry } from '../../api/types/care-archive'
import type { FieldSpec } from '../../api/types/care-archive'

const props = defineProps<{
  modelValue: FeedingEntry[]
  columns: FieldSpec[]
  warnings?: ExtractWarning[]
  defaultNurse?: string
  /** 这一天仍有效的用药委托：用药栏可一键选药，填了委托书之外的药会提示 */
  activeMedications?: ActiveMedication[]
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: FeedingEntry[]] }>()

const col = (key: string) => props.columns.find((c) => c.key === key)
const opts = (key: string) => col(key)?.options ?? []

const warnMap = computed(() => {
  const m: Record<string, string> = {}
  for (const w of props.warnings ?? []) if (w.field.startsWith('feedings.') && w.level !== 'info') m[w.field] = w.message
  return m
})
const warnOf = (i: number, key: string) => warnMap.value[`feedings.${i}.${key}`]

function setRow(i: number, patch: FeedingEntry) {
  const next = props.modelValue.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
  emit('update:modelValue', next)
}
function removeRow(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
const nowHm = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function addRow() {
  emit('update:modelValue', [...props.modelValue, { time: nowHm(), nurseName: props.defaultNurse ?? '' }])
}
function toggle(i: number, key: string, value: string) {
  setRow(i, { [key]: props.modelValue[i][key] === value ? null : value })
  // 取消"大便"时把颜色/量/性状一起清掉
  if (key === 'stool' && props.modelValue[i][key] === value) setRow(i, { stool: null, stoolColor: null, stoolAmount: null, stoolTexture: null })
}

const meds = computed(() => props.activeMedications ?? [])
const medLabel = (m: ActiveMedication) => `${m.drugName}${m.dose ? ' ' + m.dose : ''}`
function pickMed(i: number, m: ActiveMedication) {
  const cur = String(props.modelValue[i].medication ?? '').trim()
  const add = medLabel(m)
  if (!cur.includes(m.drugName)) setRow(i, { medication: cur ? `${cur}、${add}` : add })
}
/** 用药栏填了内容，但没有任何有效委托书包含这个药 → 提醒（按委托给药才有据可查） */
function noAuth(i: number): boolean {
  const v = String(props.modelValue[i].medication ?? '').trim()
  return !!v && !meds.value.some((m) => v.includes(m.drugName))
}

const sum = (k: string) => props.modelValue.reduce((a, r) => a + (Number(r[k]) || 0), 0)
const summary = computed(() => ({
  formula: sum('formulaMl'),
  breast: sum('breastMilkMl'),
  water: sum('waterMl'),
  urine: props.modelValue.filter((r) => r.urine === 'YES').length,
  stool: props.modelValue.filter((r) => r.stool === 'YES').length,
  count: props.modelValue.filter((r) => (Number(r.formulaMl) || 0) + (Number(r.breastMilkMl) || 0) > 0).length,
}))
</script>

<template>
  <div class="ft">
    <div v-if="warnMap['feedings']" class="ft-warn-all">⚠ {{ warnMap['feedings'] }}</div>

    <div v-for="(r, i) in modelValue" :key="i" class="ft-row">
      <div class="ft-line ft-head">
        <input
          class="ft-time"
          :class="{ 'ft-bad': warnOf(i, 'time') }"
          type="time"
          :value="(r.time as string) ?? ''"
          :disabled="disabled"
          @input="(e) => setRow(i, { time: (e.target as HTMLInputElement).value })"
        />
        <span class="ft-no">第 {{ i + 1 }} 次</span>
        <n-button v-if="!disabled" size="tiny" type="error" quaternary @click="removeRow(i)">删除</n-button>
      </div>

      <div class="ft-line ft-nums">
        <label v-for="k in ['directFeedMin', 'breastMilkMl', 'formulaMl', 'waterMl']" :key="k" :class="{ 'ft-bad': warnOf(i, k) }">
          <span>{{ col(k)?.label }}</span>
          <n-input-number :value="(r[k] as number | null) ?? null" :show-button="false" :disabled="disabled" size="small" placeholder="" @update:value="(v) => setRow(i, { [k]: v })" />
        </label>
      </div>

      <div class="ft-line">
        <label class="ft-grow" :class="{ 'ft-bad': warnOf(i, 'medication') }">
          <span>用药</span>
          <n-input :value="(r.medication as string) ?? ''" size="small" :disabled="disabled" @update:value="(v) => setRow(i, { medication: v })" />
        </label>
      </div>
      <div v-if="meds.length > 0 && !disabled" class="ft-line ft-meds">
        <span class="ft-medlabel">按委托选药：</span>
        <n-button v-for="m in meds" :key="m.authId + m.drugName" size="tiny" secondary type="info" @click="pickMed(i, m)">{{ medLabel(m) }}</n-button>
      </div>
      <div v-if="noAuth(i)" class="ft-msg">⚠ 这个药没有对应的、仍有效的用药委托书，请确认家长已签委托书（到“用药委托书”标签里补录）</div>

      <div class="ft-line ft-toggles">
        <n-button size="small" :type="r.urine === 'YES' ? 'primary' : 'default'" :secondary="r.urine !== 'YES'" :disabled="disabled" @click="toggle(i, 'urine', 'YES')">小便</n-button>
        <n-button size="small" :type="r.stool === 'YES' ? 'primary' : 'default'" :secondary="r.stool !== 'YES'" :disabled="disabled" @click="toggle(i, 'stool', 'YES')">大便</n-button>
        <template v-if="r.stool === 'YES'">
          <template v-for="k in ['stoolColor', 'stoolAmount', 'stoolTexture']" :key="k">
            <span class="ft-sep">|</span>
            <n-button
              v-for="o in opts(k)"
              :key="o.value"
              size="tiny"
              :type="r[k] === o.value ? 'primary' : 'default'"
              :secondary="r[k] !== o.value"
              :disabled="disabled"
              :class="{ 'ft-bad-btn': warnOf(i, k) }"
              @click="setRow(i, { [k]: r[k] === o.value ? null : o.value })"
            >
              {{ o.label }}
            </n-button>
          </template>
        </template>
      </div>

      <div class="ft-line">
        <label class="ft-grow" :class="{ 'ft-bad': warnOf(i, 'nurseName') }">
          <span>责护签字</span>
          <n-input :value="(r.nurseName as string) ?? ''" size="small" :disabled="disabled" @update:value="(v) => setRow(i, { nurseName: v })" />
        </label>
        <label class="ft-grow" :class="{ 'ft-bad': warnOf(i, 'remark') }">
          <span>备注</span>
          <n-input :value="(r.remark as string) ?? ''" size="small" :disabled="disabled" @update:value="(v) => setRow(i, { remark: v })" />
        </label>
      </div>

      <div v-for="(msg, key) in Object.fromEntries(Object.entries(warnMap).filter(([k]) => k.startsWith(`feedings.${i}.`)))" :key="key" class="ft-msg">⚠ {{ msg }}</div>
    </div>

    <div v-if="modelValue.length === 0" class="ft-empty">还没有记录，点下面的按钮添加一次喂养/排泄。</div>
    <n-button v-if="!disabled" type="primary" dashed block @click="addRow">＋ 添加一次（时间默认现在）</n-button>

    <div class="ft-sum">
      <b>汇总（自动计算）</b>：奶粉 {{ summary.formula }} ml · 母乳 {{ summary.breast }} ml · 喂水 {{ summary.water }} ml · 喂奶 {{ summary.count }} 次 · 小便 {{ summary.urine }} 次 · 大便 {{ summary.stool }} 次
    </div>
  </div>
</template>

<style scoped>
.ft-row {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fcfcfc;
}
.ft-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  margin-top: 6px;
}
.ft-head {
  margin-top: 0;
  align-items: center;
}
.ft-no {
  color: #888;
  font-size: 12px;
  margin-right: auto;
}
.ft-time {
  width: 110px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 600;
}
.ft label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #666;
}
.ft-nums label {
  width: calc(25% - 6px);
  min-width: 78px;
}
.ft-grow {
  flex: 1 1 140px;
}
.ft-toggles {
  align-items: center;
}
.ft-meds {
  align-items: center;
}
.ft-medlabel {
  color: #888;
  font-size: 12px;
}
.ft-sep {
  color: #ccc;
}
.ft-bad {
  background: #fff7e0;
  border-radius: 4px;
  outline: 2px solid #f0a020;
}
.ft-bad-btn {
  outline: 2px solid #f0a020;
}
.ft-msg,
.ft-warn-all {
  margin-top: 4px;
  font-size: 12px;
  color: #b25e00;
}
.ft-warn-all {
  margin-bottom: 8px;
}
.ft-empty {
  margin: 8px 0;
  color: #999;
  font-size: 13px;
}
.ft-sum {
  margin-top: 10px;
  padding: 8px 10px;
  background: #eef5fc;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
}
</style>
