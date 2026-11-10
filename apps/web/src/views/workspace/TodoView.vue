<script setup lang="ts">
/**
 * 我的待办：每天上午打开，一眼理清今天的工作。
 * 四个栏目左右排开——效率四象限 / 重要提醒 / 正在进行中 / 自定义快捷入口，点栏目名切换。
 */
import { onMounted, ref } from 'vue'
import QuadrantPanel from './QuadrantPanel.vue'
import ReminderPanel from './ReminderPanel.vue'
import OngoingPanel from './OngoingPanel.vue'
import ShortcutsPanel from './ShortcutsPanel.vue'

type Tab = 'quadrant' | 'reminder' | 'ongoing' | 'links'
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: 'quadrant', label: '效率四象限', short: '四象限' },
  { key: 'reminder', label: '重要提醒', short: '提醒' },
  { key: 'ongoing', label: '正在进行中', short: '进行中' },
  { key: 'links', label: '自定义快捷入口', short: '快捷入口' },
]
const tab = ref<Tab>('quadrant')
const counts = ref<Record<Tab, number>>({ quadrant: 0, reminder: 0, ongoing: 0, links: 0 })
const KEY = 'myTodoTab'
onMounted(() => {
  try {
    const t = localStorage.getItem(KEY) as Tab | null
    if (t && TABS.some((x) => x.key === t)) tab.value = t
  } catch {
    /* 记不住上次的栏目也没关系 */
  }
})
function pick(t: Tab) {
  tab.value = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}
const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
</script>

<template>
  <div class="mt">
    <div class="mt-hello">今天是 {{ today }}，先把最要紧的事排好 ✨</div>
    <nav class="mt-tabs">
      <button v-for="t in TABS" :key="t.key" :class="{ on: tab === t.key }" @click="pick(t.key)">
        <span class="mt-full">{{ t.label }}</span><span class="mt-short">{{ t.short }}</span>
        <i v-if="counts[t.key] > 0">{{ counts[t.key] }}</i>
      </button>
    </nav>
    <section class="mt-body">
      <QuadrantPanel v-show="tab === 'quadrant'" @count="(n: number) => (counts.quadrant = n)" />
      <ReminderPanel v-show="tab === 'reminder'" @count="(n: number) => (counts.reminder = n)" />
      <OngoingPanel v-show="tab === 'ongoing'" @count="(n: number) => (counts.ongoing = n)" />
      <ShortcutsPanel v-show="tab === 'links'" />
    </section>
  </div>
</template>

<style scoped>
.mt-hello { margin-bottom: 10px; color: #8a7f70; font-size: 13px; }
.mt-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.mt-tabs button { position: relative; min-height: 46px; padding: 8px 6px; border: 1px solid #e6dccb; border-radius: 12px; background: #f6f1ea; color: #5b5144; font-size: 15px; cursor: pointer; }
.mt-tabs button.on { background: #5b4a38; color: #fff; border-color: #5b4a38; font-weight: 600; }
.mt-tabs i { position: absolute; top: -6px; right: -4px; min-width: 20px; padding: 0 5px; height: 20px; line-height: 20px; border-radius: 10px; background: #d03050; color: #fff; font-size: 12px; font-style: normal; }
.mt-short { display: none; }
.mt-body { padding: 14px; background: #fbf8f3; border: 1px solid #efe7da; border-radius: 16px; }
@media (max-width: 767px) {
  .mt-tabs { gap: 6px; }
  .mt-tabs button { font-size: 13px; }
  .mt-full { display: none; }
  .mt-short { display: inline; }
  .mt-body { padding: 10px; }
}
</style>
