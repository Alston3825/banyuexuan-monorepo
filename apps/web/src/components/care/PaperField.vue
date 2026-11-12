<script setup lang="ts">
/**
 * 纸质单版式用的紧凑字段：标签 + 内联控件（选项做成可点的字，选中=高亮；数字/文字是下划线小输入框）。
 * 值的约定同 SpecForm：文本=string，数字=number，单选=选项代码，多选=代码数组。
 * AI 识别后没把握的字段（warn）标黄，用户改过就消除。
 */
import { computed, ref } from 'vue'
import type { FieldSpec } from '../../api/types/care-archive'

const props = defineProps<{
  field: FieldSpec
  modelValue: Record<string, unknown>
  warn?: string
  /** 不显示字段名（外面已经有表头了） */
  noLabel?: boolean
  /** 部位行样式：左边是加粗的“部位”名（固定宽度），右边是可点的描述选项，层次分明（体征用） */
  part?: boolean
  /** 文本框行数（longtext 用） */
  rows?: number
  width?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

const touched = ref(false)
const showWarn = computed(() => !!props.warn && !touched.value)
const v = computed(() => props.modelValue[props.field.key])
function set(value: unknown) {
  touched.value = true
  emit('update:modelValue', { ...props.modelValue, [props.field.key]: value })
}
const isOn = (code: string) => (props.field.kind === 'multi' ? Array.isArray(v.value) && (v.value as string[]).includes(code) : v.value === code)
function pick(code: string) {
  if (props.field.kind === 'multi') {
    const cur = Array.isArray(v.value) ? (v.value as string[]) : []
    set(cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code])
  } else set(v.value === code ? null : code)
}
function onNum(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  if (raw === '') return set(null)
  const n = Number(raw)
  if (Number.isFinite(n)) set(props.field.kind === 'int' ? Math.round(n) : n)
}
const outOfRange = computed(() => {
  const x = v.value
  const f = props.field
  return typeof x === 'number' && ((f.min !== undefined && x < f.min) || (f.max !== undefined && x > f.max))
})
</script>

<template>
  <div class="pf" :class="{ 'pf-warn': showWarn, 'pf-block': field.kind === 'longtext', 'pf-part': part }" :title="showWarn ? warn : outOfRange ? '超出常见范围，请核对' : ''">
    <span v-if="!noLabel" class="pf-label">{{ field.label }}<small v-if="field.unit">{{ field.unit }}</small></span>
    <span v-if="field.kind === 'single' || field.kind === 'multi'" class="pf-opts">
      <button v-for="o in field.options" :key="o.value" type="button" class="pf-chip" :class="{ 'pf-on': isOn(o.value) }" @click="pick(o.value)">{{ o.label }}</button>
    </span>
    <input
      v-else-if="field.kind === 'int' || field.kind === 'decimal'"
      class="pf-in"
      :class="{ 'pf-bad': outOfRange }"
      inputmode="decimal"
      :style="{ width: width ?? '64px' }"
      :value="v ?? ''"
      @change="onNum"
    />
    <textarea v-else-if="field.kind === 'longtext'" class="pf-ta" :rows="rows ?? 3" :value="(v as string) ?? ''" @input="(e) => set((e.target as HTMLTextAreaElement).value)" />
    <input v-else class="pf-in" :style="{ width: width ?? '110px' }" :value="(v as string) ?? ''" @input="(e) => set((e.target as HTMLInputElement).value)" />
    <span v-if="showWarn" class="pf-msg" :title="warn">⚠</span>
  </div>
</template>

<style scoped>
.pf {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 13px;
  max-width: 100%;
}
.pf-block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
}
.pf-label {
  color: #161615;
  white-space: nowrap;
}
.pf-label small {
  margin-left: 2px;
  color: #86817a;
  font-size: 11px;
}
.pf-opts {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 4px;
}
.pf-chip {
  padding: 1px 8px;
  border: 1px solid #d6d2c8;
  border-radius: 10px;
  background: #fbfaf6;
  color: #3b3a37;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.pf-chip:hover {
  background: #eeebe3;
}
.pf-part {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 4px 4px;
}
.pf-part .pf-label {
  flex: 0 0 auto;
  min-width: 52px;
  max-width: 90px;
  padding: 2px 6px 2px 0;
  border-right: 3px solid #dde7f0;
  color: #5b83aa;
  font-size: 14px;
  font-weight: 700;
  line-height: 24px;
}
.pf-part .pf-opts {
  flex: 1;
  gap: 4px 6px;
}
.pf-chip.pf-on {
  border-color: #5f6b49;
  background: #edf1e9;
  color: #5f6b49;
  font-weight: 700;
}
.pf-in {
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-bottom: 1px solid #86817a;
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  outline: none;
}
.pf-in:focus {
  border-bottom-color: #5f6b49;
  background: #edf1e9;
}
.pf-bad {
  color: #9a4f33;
  background: #f4ecdf;
}
.pf-ta {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #d6d2c8;
  border-radius: 4px;
  font-size: 13px;
  resize: vertical;
  outline: none;
  font-family: inherit;
}
.pf-ta:focus {
  border-color: #5f6b49;
}
.pf-warn {
  background: #f4ecdf;
  box-shadow: inset 3px 0 0 #c96f4f;
}
.pf-msg {
  color: #9a4f33;
  font-size: 12px;
  cursor: help;
}

/* 手机：控件放大，方便手指点 */
@media (max-width: 767px) {
  .pf {
    font-size: 14px;
    gap: 4px 8px;
    padding: 4px 2px;
  }
  .pf-chip {
    padding: 5px 12px;
    border-color: #e6e3d9;
    border-radius: 16px;
    font-size: 14px;
    line-height: 20px;
  }
  .pf-in {
    height: 34px;
    padding: 0 8px;
    border: 1px solid #d6d2c8;
    border-radius: 6px;
    font-size: 16px;
  }
  .pf-ta {
    font-size: 15px;
  }
}
</style>
