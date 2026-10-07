<script setup lang="ts">
/** 我的待办：所有需要当前登录人处理的事情放在一处，已超时/快到期的排最前并标红。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NSpin, NTag } from 'naive-ui'
import { workspaceApi } from '../../api/modules/workspace.api'
import type { TodoItem, TodoKind, TodoSummary } from '../../api/types/workflow'

const router = useRouter()
const data = ref<TodoSummary | null>(null)
const loading = ref(false)
const filter = ref<TodoKind | 'ALL'>('ALL')

const KIND_LABEL: Record<TodoKind, string> = { APPROVAL: '待我审批', REJECTED: '被驳回', EXPIRY: '证件/合同到期', OUTREACH: '回访任务', COLLECT: '待汇总', PURCHASE: '待采购', RECEIVE: '待收货' }
const LEVEL_TAG: Record<string, 'error' | 'warning' | 'info'> = { danger: 'error', warning: 'warning', info: 'info' }

async function load() {
  loading.value = true
  try {
    data.value = await workspaceApi.todos()
  } finally {
    loading.value = false
  }
}
let timer: number | undefined
onMounted(() => {
  load()
  timer = window.setInterval(load, 120_000)
})
onBeforeUnmount(() => window.clearInterval(timer))

const items = computed<TodoItem[]>(() => (data.value?.items ?? []).filter((i) => filter.value === 'ALL' || i.kind === filter.value))
const urgent = computed(() => items.value.filter((i) => i.overdue))
const normal = computed(() => items.value.filter((i) => !i.overdue))
const dt = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
</script>

<template>
  <n-spin :show="loading">
    <div class="td-chips">
      <n-tag :type="filter === 'ALL' ? 'primary' : 'default'" round checkable :checked="filter === 'ALL'" @update:checked="filter = 'ALL'">全部 {{ data?.total ?? 0 }}</n-tag>
      <n-tag v-for="(label, k) in KIND_LABEL" :key="k" round checkable :checked="filter === k" :type="filter === k ? 'primary' : 'default'" @update:checked="filter = k as TodoKind">
        {{ label }} {{ data?.byKind[k] ?? 0 }}
      </n-tag>
      <n-button size="small" quaternary @click="load">刷新</n-button>
    </div>

    <n-empty v-if="data && items.length === 0" description="目前没有需要你处理的事项 🎉" style="margin-top: 60px" />

    <template v-if="urgent.length">
      <div class="td-sec td-sec-red">已超时 / 已逾期（{{ urgent.length }}）</div>
      <div v-for="i in urgent" :key="i.key" class="td-card td-red" @click="router.push(i.link)">
        <div class="td-title">{{ i.title }}</div>
        <div class="td-desc">{{ i.desc }}</div>
        <n-tag size="small" type="error" :bordered="false">{{ KIND_LABEL[i.kind] }}</n-tag>
      </div>
    </template>
    <template v-if="normal.length">
      <div class="td-sec">待处理（{{ normal.length }}）</div>
      <div v-for="i in normal" :key="i.key" class="td-card" :class="{ 'td-warn': i.level === 'warning' }" @click="router.push(i.link)">
        <div class="td-title">{{ i.title }}</div>
        <div class="td-desc">{{ i.desc }}</div>
        <n-tag size="small" :type="LEVEL_TAG[i.level]" :bordered="false">{{ KIND_LABEL[i.kind] }}</n-tag>
        <span v-if="i.dueAt" class="td-due">{{ i.kind === 'APPROVAL' ? '处理期限' : '日期' }} {{ dt(i.dueAt) }}</span>
      </div>
    </template>
  </n-spin>
</template>

<style scoped>
.td-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.td-sec {
  margin: 14px 0 6px;
  font-weight: 600;
  font-size: 13px;
}
.td-sec-red {
  color: #d03050;
}
.td-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-left: 4px solid #2080f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.td-card:hover {
  background: #f8fafc;
}
.td-warn {
  border-left-color: #f0a020;
}
.td-red {
  border-left-color: #d03050;
  background: #fff8f8;
}
.td-title {
  font-weight: 600;
  font-size: 14px;
}
.td-desc {
  margin: 4px 0 6px;
  color: #666;
  font-size: 12px;
}
.td-due {
  margin-left: 8px;
  color: #999;
  font-size: 12px;
}
</style>
