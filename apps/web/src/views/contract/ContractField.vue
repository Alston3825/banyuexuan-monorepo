<script setup lang="ts">
/** 核对页里的一个字段：标签 + 控件(插槽) + AI 提醒。黄色=请核对，红色=缺失/必填没填。 */
defineProps<{
  label: string
  note?: { level: 'missing' | 'warn'; message: string; page: number | null } | null
  required?: boolean
  auto?: string
}>()
defineEmits<{ (e: 'goto-page', page: number): void }>()
</script>

<template>
  <div class="cf" :class="note ? `cf-${note.level}` : ''">
    <label class="cf-label">
      {{ label }}<span v-if="required" class="cf-req">*</span>
      <span v-if="auto" class="cf-auto">{{ auto }}</span>
    </label>
    <slot />
    <div v-if="note" class="cf-note">
      {{ note.message }}
      <a v-if="note.page" class="cf-page" @click="$emit('goto-page', note.page!)">看第{{ note.page }}页</a>
    </div>
  </div>
</template>

<style scoped>
.cf {
  padding: 4px 6px 6px;
  border-radius: 6px;
  border-left: 3px solid transparent;
}
.cf-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 3px;
}
.cf-req {
  color: #d03050;
  margin-left: 2px;
}
.cf-auto {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  background: #e6f1fb;
  color: #185fa5;
  font-size: 11px;
}
.cf-warn {
  background: #fff7e6;
  border-left-color: #ef9f27;
}
.cf-missing {
  background: #fdeeee;
  border-left-color: #e24b4a;
}
.cf-note {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
}
.cf-warn .cf-note {
  color: #854f0b;
}
.cf-missing .cf-note {
  color: #a32d2d;
}
.cf-page {
  margin-left: 6px;
  color: #2080f0;
  cursor: pointer;
  text-decoration: underline;
}
</style>
