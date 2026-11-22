<script setup lang="ts">
/**
 * 我的待办：每天上午打开，一眼理清今天的工作。
 * 四个栏目左右排开——效率四象限 / 重要提醒 / 正在进行中 / 自定义快捷入口，点栏目名切换。
 */
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import QuadrantPanel from './QuadrantPanel.vue'
import ReminderPanel from './ReminderPanel.vue'
import OngoingPanel from './OngoingPanel.vue'
import ShortcutsPanel from './ShortcutsPanel.vue'
import BxTheme from '../../components/BxTheme.vue'

type Tab = 'quadrant' | 'reminder' | 'ongoing' | 'links'
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: 'quadrant', label: '效率四象限', short: '四象限' },
  { key: 'reminder', label: '重要提醒', short: '提醒' },
  { key: 'ongoing', label: '正在进行中', short: '进行中' },
  { key: 'links', label: '自定义快捷入口', short: '快捷入口' },
]
const tab = ref<Tab>('reminder')
const route = useRoute()
const counts = ref<Record<Tab, number>>({ quadrant: 0, reminder: 0, ongoing: 0, links: 0 })
const KEY = 'myTodoTab'
watch(() => route.query.tab, (requested) => {
  if (typeof requested === 'string' && TABS.some((x) => x.key === requested)) {
    tab.value = requested as Tab
    return
  }
  try {
    const saved = localStorage.getItem(KEY) as Tab | null
    tab.value = saved && TABS.some((x) => x.key === saved) ? saved : 'reminder'
  } catch {
    tab.value = 'reminder'
  }
}, { immediate: true })
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
  <BxTheme>
  <div class="mt">
    <h2 class="mt-hello bx-serif">{{ today }}</h2>
    <p class="mt-sub">先把最要紧的事排好。</p>
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
  </BxTheme>
</template>

<style scoped>
.mt-hello { margin: 0; font-size: 24px; font-weight: 700; }
.mt-sub { margin: 4px 0 18px; color: var(--bx-gray); font-size: 14px; }
.mt-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
.mt-tabs button { position: relative; min-height: 46px; padding: 8px 6px; border: 1px solid var(--bx-paper-3); border-radius: 10px; background: var(--bx-paper-2); color: var(--bx-ink); font-size: 15px; cursor: pointer; font-family: inherit; transition: background 0.15s; }
.mt-tabs button:hover { background: var(--bx-paper-3); }
.mt-tabs button.on { background: var(--bx-ink); color: var(--bx-paper); border-color: var(--bx-ink); font-weight: 600; }
.mt-tabs i { position: absolute; top: -6px; right: -4px; min-width: 20px; padding: 0 5px; height: 20px; line-height: 20px; border-radius: 10px; background: var(--bx-clay); color: var(--bx-paper); font-size: 12px; font-style: normal; font-family: var(--bx-mono); }
.mt-short { display: none; }
@media (max-width: 767px) {
  .mt-hello { font-size: 20px; }
  .mt-tabs { gap: 6px; }
  .mt-tabs button { font-size: 13px; }
  .mt-full { display: none; }
  .mt-short { display: inline; }
}
</style>
