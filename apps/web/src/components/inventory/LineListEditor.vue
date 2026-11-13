<script setup lang="ts" generic="T">
/**
 * 明细行编辑器（盘点/调拨/入库等表单里“一行一个物品”）：每行有“第 N 项”和明确的“删除这一项”按钮，
 * 底下一个整行宽的“＋ 添加一个××”按钮——替代原来右边看不懂的 “－ ＋” 小按钮。
 */
import { watch } from 'vue'
import { NButton } from 'naive-ui'

const props = withDefaults(defineProps<{ modelValue: T[]; onCreate: () => T; addText?: string; unitText?: string }>(), { addText: '添加一项', unitText: '项' })
const emit = defineEmits<{ 'update:modelValue': [value: T[]] }>()

// 一进来就有一行可填，不用先点“添加”
watch(() => props.modelValue.length, (n) => n === 0 && emit('update:modelValue', [props.onCreate()]), { immediate: true })
const add = () => emit('update:modelValue', [...props.modelValue, props.onCreate()])
const remove = (i: number) => emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
</script>

<template>
  <div class="le">
    <div v-for="(row, i) in modelValue" :key="i" class="le-row">
      <div class="le-head">
        <b>第 {{ i + 1 }} {{ unitText }}</b>
        <n-button size="small" type="error" quaternary :disabled="modelValue.length <= 1" @click="remove(i)">🗑 删除这一{{ unitText }}</n-button>
      </div>
      <slot :value="row" :index="i" />
    </div>
    <n-button type="primary" dashed block @click="add">＋ {{ addText }}</n-button>
  </div>
</template>

<style scoped>
.le {
  width: 100%;
}
.le-row {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid var(--c-e6e6e6);
  border-radius: 8px;
  background: var(--c-fcfcfc);
}
.le-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--c-666666);
  font-size: 13px;
}
</style>
