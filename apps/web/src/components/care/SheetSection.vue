<script setup lang="ts">
/**
 * 日常护理记录里的一张“分段卡片”：标题 + 一行摘要（已填多少/关键数字）+ 内容。
 * 电脑端始终展开；手机上默认折叠，点标题展开，摘要让人不展开也知道这段填没填。
 * state：'empty' 没填（标橙色提醒）/ 'done' 已填 / 'plain' 不提示。
 */
defineProps<{ title: string; summary?: string; state?: 'empty' | 'done' | 'plain'; open: boolean; collapsible: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <section class="ss" :class="[`ss-${state ?? 'plain'}`, { 'ss-closed': collapsible && !open }]">
    <header class="ss-h" :class="{ 'ss-click': collapsible }" @click="collapsible && $emit('toggle')">
      <span class="ss-t">{{ title }}</span>
      <span class="ss-s">{{ summary }}</span>
      <span v-if="collapsible" class="ss-arrow">{{ open ? '▾' : '▸' }}</span>
    </header>
    <div v-show="!collapsible || open" class="ss-b"><slot /></div>
  </section>
</template>

<style scoped>
.ss {
  margin-bottom: 10px;
  border: 1px solid #d6d2c8;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.ss-h {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: #fbfaf6;
  border-bottom: 1px solid #e6e3d9;
}
.ss-closed .ss-h {
  border-bottom: 0;
}
.ss-click {
  cursor: pointer;
  min-height: 40px;
}
.ss-t {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 700;
  color: #5b83aa;
}
.ss-s {
  flex: 1;
  min-width: 0;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #5f6b49;
}
.ss-empty .ss-s {
  color: #9a4f33;
}
.ss-empty {
  border-color: #c96f4f;
}
.ss-arrow {
  color: #86817a;
}
.ss-b {
  padding: 8px 10px 10px;
}
</style>
