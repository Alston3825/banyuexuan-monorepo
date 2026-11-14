<script setup lang="ts">
/**
 * 按"字段说明书"自动生成的评估表表单（录入、AI 识别结果复核、只读查看共用）。
 * 值的约定：文本=string，整数/小数=number，日期='YYYY-MM-DD'，单选=选项代码，多选=代码数组。
 * warnings 是 AI 识别时给出的"需要人工核对"的提醒：对应字段会标黄并显示原因，核对改动后自动消除。
 */
import { computed, reactive } from 'vue'
import { NButton, NDatePicker, NInput, NInputNumber, NSpace } from 'naive-ui'
import type { ExtractWarning, FieldSpec, GroupSpec } from '../../api/types/care-archive'
import { useNarrow } from '../../composables/useNarrow'
import SheetSection from './SheetSection.vue'

const props = defineProps<{
  spec: { groups: GroupSpec[] }
  modelValue: Record<string, unknown>
  warnings?: ExtractWarning[]
  readonly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

// 手机上每组是一张可折叠的卡片，折叠时一行摘要（已填多少）；电脑端始终展开
const narrow = useNarrow()
const openMap = reactive<Record<string, boolean>>({})
const isOpen = (title: string, idx: number) => openMap[title] ?? idx === 0
const has = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
const groupSummary = (g: GroupSpec) => {
  const n = g.fields.filter((f) => has(props.modelValue[f.key])).length
  return n ? `已填 ${n}/${g.fields.length}` : '还没填'
}
const groupState = (g: GroupSpec) => (g.fields.some((f) => has(props.modelValue[f.key])) ? 'done' : props.readonly ? 'plain' : 'empty')

/** 用户改过的字段不再显示 AI 提醒（认为已核对） */
const touched = new Set<string>()

const warnMap = computed(() => {
  const m: Record<string, ExtractWarning> = {}
  for (const w of props.warnings ?? []) {
    if (w.level === 'info' || touched.has(w.field)) continue
    if (!m[w.field] || w.level === 'warn') m[w.field] = w
  }
  return m
})
defineExpose({ warnCount: computed(() => Object.keys(warnMap.value).length) })

function set(key: string, value: unknown) {
  touched.add(key)
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const pad = (n: number) => String(n).padStart(2, '0')
const toTs = (iso: unknown): number | null => {
  if (typeof iso !== 'string' || iso.length < 10) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const fromTs = (ts: number | null): string | null => {
  if (ts === null) return null
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const labelOf = (f: FieldSpec, value: string) => f.options?.find((o) => o.value === value)?.label ?? value

function toggleSingle(f: FieldSpec, value: string) {
  set(f.key, props.modelValue[f.key] === value ? null : value)
}
function toggleMulti(f: FieldSpec, value: string) {
  const cur = Array.isArray(props.modelValue[f.key]) ? (props.modelValue[f.key] as string[]) : []
  set(f.key, cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value])
}

/** 数值超出常见范围时给一句温和的提醒（不拦截保存，防止多打/少打一位） */
/** 三个黄疸值（前额/眼角/前胸）后面显示的平均值：key = 排在最后的那个黄疸字段 */
const AVG_AFTER: Record<string, { label: string; keys: string[] }> = {
  jaundiceChest: { label: '黄疸平均值', keys: ['jaundiceForehead', 'jaundiceCanthus', 'jaundiceChest'] }, // 日常记录、新生儿入所评估
  admissionJaundiceChest: { label: '入所黄疸平均值', keys: ['admissionJaundiceForehead', 'admissionJaundiceCanthus', 'admissionJaundiceChest'] }, // 宝宝出所评估
  dischargeJaundiceChest: { label: '出所黄疸平均值', keys: ['dischargeJaundiceForehead', 'dischargeJaundiceCanthus', 'dischargeJaundiceChest'] },
}
function avgText(keys: string[]): string {
  const nums = keys.map((k) => props.modelValue[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return '-'
  const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
  return nums.length < keys.length ? `${avg}（按已填的 ${nums.length} 个算）` : String(avg)
}

function rangeHint(f: FieldSpec): string | null {
  const v = props.modelValue[f.key]
  if (typeof v !== 'number') return null
  if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) return `${v} 超出常见范围（${f.min ?? ''}~${f.max ?? ''}），请核对`
  return null
}

const wide = (f: FieldSpec) => f.kind === 'longtext' || (f.kind === 'multi' && (f.options?.length ?? 0) > 2) || (f.kind === 'single' && (f.options?.length ?? 0) > 3)

function readonlyText(f: FieldSpec): string {
  const v = props.modelValue[f.key]
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '-'
  if (f.kind === 'single') return labelOf(f, String(v))
  if (f.kind === 'multi') return (v as string[]).map((x) => labelOf(f, x)).join('、')
  if (f.kind === 'date') return String(v).slice(0, 10)
  return f.unit ? `${v} ${f.unit}` : String(v)
}
</script>

<template>
  <div class="sf">
    <SheetSection v-for="(g, gi) in spec.groups" :key="g.title" :title="g.title" :summary="groupSummary(g)" :state="groupState(g)" :open="isOpen(g.title, gi)" :collapsible="narrow" @toggle="openMap[g.title] = !isOpen(g.title, gi)">
      <div class="sf-grid">
        <template v-for="f in g.fields" :key="f.key">
        <div class="sf-cell" :class="{ 'sf-wide': wide(f), 'sf-warn': !!warnMap[f.key] }">
          <div class="sf-label">
            {{ f.label }}<span v-if="f.unit && !readonly" class="sf-unit">（{{ f.unit }}）</span>
            <span v-if="f.hint && !readonly" class="sf-hint">{{ f.hint }}</span>
          </div>

          <div v-if="readonly" class="sf-readonly">{{ readonlyText(f) }}</div>
          <template v-else>
            <n-input v-if="f.kind === 'text'" :value="(modelValue[f.key] as string) ?? ''" clearable @update:value="(v) => set(f.key, v)" />
            <n-input
              v-else-if="f.kind === 'longtext'"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 12 }"
              :value="(modelValue[f.key] as string) ?? ''"
              @update:value="(v) => set(f.key, v)"
            />
            <n-input-number
              v-else-if="f.kind === 'int' || f.kind === 'decimal'"
              :value="(modelValue[f.key] as number | null) ?? null"
              :show-button="false"
              :precision="f.kind === 'int' ? 0 : undefined"
              clearable
              style="width: 100%"
              @update:value="(v) => set(f.key, v)"
            />
            <n-date-picker
              v-else-if="f.kind === 'date'"
              type="date"
              clearable
              style="width: 100%"
              :value="toTs(modelValue[f.key])"
              @update:value="(v) => set(f.key, fromTs(v))"
            />
            <n-space v-else-if="f.kind === 'single'" size="small" :wrap="true">
              <n-button
                v-for="o in f.options"
                :key="o.value"
                size="small"
                :type="modelValue[f.key] === o.value ? 'primary' : 'default'"
                :secondary="modelValue[f.key] !== o.value"
                @click="toggleSingle(f, o.value)"
              >
                {{ o.label }}
              </n-button>
            </n-space>
            <n-space v-else size="small" :wrap="true">
              <n-button
                v-for="o in f.options"
                :key="o.value"
                size="small"
                :type="Array.isArray(modelValue[f.key]) && (modelValue[f.key] as string[]).includes(o.value) ? 'primary' : 'default'"
                :secondary="!(Array.isArray(modelValue[f.key]) && (modelValue[f.key] as string[]).includes(o.value))"
                @click="toggleMulti(f, o.value)"
              >
                {{ o.label }}
              </n-button>
            </n-space>
          </template>

          <div v-if="warnMap[f.key]" class="sf-msg">⚠ {{ warnMap[f.key].message }}</div>
          <div v-else-if="!readonly && rangeHint(f)" class="sf-msg sf-range">{{ rangeHint(f) }}</div>
        </div>
        <!-- 黄疸值三个部位填完后面自动显示平均值（只读，不入库，由三个数现算） -->
        <div v-if="AVG_AFTER[f.key]" class="sf-cell sf-avg">
          <div class="sf-label">{{ AVG_AFTER[f.key].label }}<span class="sf-unit">（自动计算）</span></div>
          <div class="sf-avg-val">{{ avgText(AVG_AFTER[f.key].keys) }}</div>
        </div>
        </template>
      </div>
    </SheetSection>
  </div>
</template>

<style scoped>
.sf-group {
  margin-bottom: 18px;
}
.sf-title {
  margin: 0 0 8px;
  padding-left: 8px;
  border-left: 3px solid var(--c-d9822b);
  font-size: 14px;
  color: var(--c-2a64b0);
}
.sf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px 12px;
}
.sf-cell {
  padding: 4px 6px;
  border-radius: 4px;
}
.sf-wide {
  grid-column: 1 / -1;
}
.sf-label {
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--c-444444);
}
.sf-unit {
  color: var(--c-999999);
}
.sf-hint {
  margin-left: 6px;
  color: var(--c-aaaaaa);
  font-size: 12px;
}
.sf-readonly {
  min-height: 22px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--c-222222);
}
.sf-avg {
  background: var(--c-eef5fc);
  border-radius: 6px;
}
.sf-avg-val {
  min-height: 34px;
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--c-2a64b0);
}
.sf-warn {
  background: var(--c-fff7e0);
  border-left: 3px solid var(--c-f0a020);
}
.sf-msg {
  margin-top: 3px;
  font-size: 12px;
  color: var(--c-b25e00);
  line-height: 1.5;
}
.sf-range {
  color: var(--c-c07010);
}
</style>
