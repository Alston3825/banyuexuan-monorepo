<script setup lang="ts">
/**
 * 宝宝 24 小时喂养记录单（电脑端）：和纸质单一样的一张表，一行一次喂养/排泄，
 * 列 = 时间 | 亲喂 | 母乳 | 奶粉 | 药物记录（药名/剂量） | 喂水 | 小便 | 大便 | 责护签字；最下面“总结”行自动合计。
 * 手机上用卡片行的 FeedingTable（见 DailyPaperSheet），两个组件的数据格式和提醒规则完全一致。
 */
import { computed } from 'vue'
import type { ActiveMedication, ExtractWarning, FeedingEntry, FieldSpec } from '../../api/types/care-archive'

const props = defineProps<{
  modelValue: FeedingEntry[]
  columns: FieldSpec[]
  warnings?: ExtractWarning[]
  defaultNurse?: string
  activeMedications?: ActiveMedication[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: FeedingEntry[]] }>()

const opts = (key: string) => props.columns.find((c) => c.key === key)?.options ?? []
const warnMap = computed(() => {
  const m: Record<string, string> = {}
  for (const w of props.warnings ?? []) if (w.field.startsWith('feedings.') && w.level !== 'info') m[w.field] = w.message
  return m
})
const warnOf = (i: number, key: string) => warnMap.value[`feedings.${i}.${key}`]

function setRow(i: number, patch: FeedingEntry) {
  emit('update:modelValue', props.modelValue.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
}
const removeRow = (i: number) => emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
const nowHm = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const addRow = () => emit('update:modelValue', [...props.modelValue, { time: nowHm(), nurseName: props.defaultNurse ?? '' }])
function num(i: number, key: string, e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  setRow(i, { [key]: raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : null })
}
function toggle(i: number, key: 'urine' | 'stool') {
  const on = props.modelValue[i][key] === 'YES'
  if (key === 'stool' && on) setRow(i, { stool: null, stoolColor: null, stoolAmount: null, stoolTexture: null })
  else setRow(i, { [key]: on ? null : 'YES' })
}

const meds = computed(() => props.activeMedications ?? [])
const medLabel = (m: ActiveMedication) => m.drugName
/** 填药名时，如果正好是有效委托里的药，剂量空着就自动带上委托书上的剂量 */
function onMedName(i: number, v: string) {
  const m = meds.value.find((x) => x.drugName === v.trim())
  const patch: FeedingEntry = { medication: v }
  if (m?.dose && !String(props.modelValue[i].medicationDose ?? '').trim()) patch.medicationDose = m.dose
  setRow(i, patch)
}
const noAuth = (i: number) => {
  const v = String(props.modelValue[i].medication ?? '').trim()
  return !!v && !meds.value.some((m) => v.includes(m.drugName))
}
const sum = (k: string) => props.modelValue.reduce((a, r) => a + (Number(r[k]) || 0), 0)
const count = (k: string) => props.modelValue.filter((r) => r[k] === 'YES').length
</script>

<template>
  <div class="fg">
    <div v-if="warnMap['feedings']" class="fg-warnall">⚠ {{ warnMap['feedings'] }}</div>
    <table class="fg-t">
      <thead>
        <tr>
          <th class="w-time" rowspan="2">时间</th>
          <th class="w-n" rowspan="2">亲喂<small>分</small></th>
          <th class="w-n" rowspan="2">母乳<small>ml</small></th>
          <th class="w-n" rowspan="2">奶粉<small>ml</small></th>
          <th colspan="2">药物记录</th>
          <th class="w-n" rowspan="2">喂水<small>ml</small></th>
          <th class="w-c" rowspan="2">小便</th>
          <th class="w-stool" rowspan="2">大便 颜色/量/性</th>
          <th class="w-nurse" rowspan="2">责护签字</th>
          <th class="w-x" rowspan="2">操作</th>
        </tr>
        <tr>
          <th class="w-med">药名</th>
          <th class="w-dose">剂量</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in modelValue" :key="i">
          <td :class="{ bad: warnOf(i, 'time') }"><input type="time" :value="(r.time as string) ?? ''" @input="(e) => setRow(i, { time: (e.target as HTMLInputElement).value })" /></td>
          <td v-for="k in ['directFeedMin', 'breastMilkMl', 'formulaMl']" :key="k" :class="{ bad: warnOf(i, k) }"><input class="n" inputmode="numeric" :value="r[k] ?? ''" @change="(e) => num(i, k, e)" /></td>
          <td :class="{ bad: warnOf(i, 'medication') || noAuth(i) }" :title="noAuth(i) ? '这个药没有对应的、仍有效的用药委托书，请确认家长已签委托书' : ''">
            <input list="fg-meds" :value="(r.medication as string) ?? ''" @input="(e) => onMedName(i, (e.target as HTMLInputElement).value)" />
          </td>
          <td :class="{ bad: warnOf(i, 'medicationDose') }"><input :value="(r.medicationDose as string) ?? ''" @input="(e) => setRow(i, { medicationDose: (e.target as HTMLInputElement).value })" /></td>
          <td :class="{ bad: warnOf(i, 'waterMl') }"><input class="n" inputmode="numeric" :value="r.waterMl ?? ''" @change="(e) => num(i, 'waterMl', e)" /></td>
          <td class="c"><button type="button" class="tick" :class="{ on: r.urine === 'YES' }" @click="toggle(i, 'urine')">✓</button></td>
          <td :class="{ bad: warnOf(i, 'stoolColor') || warnOf(i, 'stoolAmount') || warnOf(i, 'stoolTexture') || warnOf(i, 'stool') }">
            <div class="stool-cell"><button type="button" class="tick" :class="{ on: r.stool === 'YES' }" @click="toggle(i, 'stool')">✓</button>
            <template v-if="r.stool === 'YES'">
              <select v-for="k in ['stoolColor', 'stoolAmount', 'stoolTexture']" :key="k" :value="(r[k] as string) ?? ''" @change="(e) => setRow(i, { [k]: (e.target as HTMLSelectElement).value || null })">
                <option value="">{{ k === 'stoolColor' ? '颜色' : k === 'stoolAmount' ? '量' : '性状' }}</option>
                <option v-for="o in opts(k)" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </template></div>
          </td>
          <td :class="{ bad: warnOf(i, 'nurseName') }"><input :value="(r.nurseName as string) ?? ''" @input="(e) => setRow(i, { nurseName: (e.target as HTMLInputElement).value })" /></td>
          <td class="c"><button type="button" class="del" title="删除这一行" @click="removeRow(i)">删除</button></td>
        </tr>
        <tr v-if="modelValue.length === 0">
          <td colspan="11" class="empty">还没有记录，点下面“＋ 添加一行”，或拍照识别。</td>
        </tr>
        <tr class="sum">
          <td>总结</td>
          <td></td>
          <td>{{ sum('breastMilkMl') || '' }}</td>
          <td>{{ sum('formulaMl') || '' }}</td>
          <td colspan="2"></td>
          <td>{{ sum('waterMl') || '' }}</td>
          <td class="c">{{ count('urine') || '' }}</td>
          <td>大便 {{ count('stool') }} 次</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>
    <datalist id="fg-meds"><option v-for="m in meds" :key="m.authId + m.drugName" :value="medLabel(m)" /></datalist>
    <button type="button" class="add" @click="addRow">＋ 添加一行（时间默认现在）</button>
  </div>
</template>

<style scoped>
.fg-t {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}
.fg-t th,
.fg-t td {
  border: 1px solid #86817a;
  padding: 1px 3px;
  text-align: center;
  vertical-align: middle;
}
.fg-t th {
  background: #f7f5ef;
  font-weight: 600;
  padding: 4px 2px;
}
.fg-t th small {
  margin-left: 2px;
  color: #86817a;
  font-weight: 400;
  font-size: 11px;
}
.w-time { width: 84px; }
.w-n { width: 52px; }
.w-med { width: 110px; }
.w-dose { width: 80px; }
.w-c { width: 48px; }
.w-stool { width: 250px; }
.w-nurse { width: 76px; }
.w-x { width: 64px; }
.stool-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}
.fg-t input:not([type='time']),
.fg-t select {
  width: 100%;
  height: 26px;
  padding: 0 3px;
  border: 0;
  background: transparent;
  font-size: 13px;
  outline: none;
  text-align: center;
}
.fg-t input[type='time'] {
  width: 100%;
  height: 26px;
  border: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  outline: none;
}
.fg-t input:focus,
.fg-t select:focus {
  background: #edf1e9;
}
.fg-t select {
  width: 62px;
  margin-left: 0;
  border: 1px solid #d6d2c8;
  border-radius: 4px;
  font-size: 12px;
}
.tick {
  width: 24px;
  height: 22px;
  border: 1px solid #d6d2c8;
  border-radius: 4px;
  background: #fff;
  color: #d6d2c8;
  cursor: pointer;
}
.tick.on {
  border-color: #5f6b49;
  background: #edf1e9;
  color: #5f6b49;
  font-weight: 700;
}
.del {
  padding: 1px 8px;
  border: 1px solid #e8cbc8;
  border-radius: 4px;
  background: #fff;
  color: #b4533a;
  font-size: 12px;
  cursor: pointer;
}
.del:hover {
  background: #f6e9e6;
}
td.bad {
  background: #f4ecdf;
  outline: 2px solid #c96f4f;
  outline-offset: -2px;
}
.sum td {
  background: #fbfaf6;
  font-weight: 600;
  padding: 3px;
}
.empty {
  padding: 14px;
  color: #86817a;
}
.fg-warnall {
  margin-bottom: 6px;
  color: #9a4f33;
  font-size: 12px;
}
.add {
  margin-top: 6px;
  width: 100%;
  padding: 5px;
  border: 1px dashed #5f6b49;
  border-radius: 6px;
  background: #fff;
  color: #5f6b49;
  cursor: pointer;
}
</style>
