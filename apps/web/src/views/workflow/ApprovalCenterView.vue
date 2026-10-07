<script setup lang="ts">
/** 审批中心：待我审批 / 我已处理 / 我发起的 / 抄送我的。 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NDataTable, NEmpty, NInput, NSpace, NTabPane, NTabs, NTag, type DataTableColumns } from 'naive-ui'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import type { ApprovalRow, ApprovalTab } from '../../api/types/workflow'
import { renderStatusBadge, WORKFLOW_INSTANCE_STATUS_MAP, APPROVER_STATUS_MAP } from '../../utils/status-map'

const router = useRouter()
const tab = ref<ApprovalTab>('pending')
const keyword = ref('')
const rows = ref<ApprovalRow[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(false)

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-').slice(0, 16) : '-')
const open = (r: ApprovalRow) => router.push(`/workflow/instances/${r.instanceId}`)

async function load() {
  loading.value = true
  try {
    rows.value = await workflowInstanceApi.approvals(tab.value, keyword.value.trim())
  } finally {
    loading.value = false
  }
}
async function loadCounts() {
  const [p, m] = await Promise.all([workflowInstanceApi.approvals('pending'), workflowInstanceApi.approvals('mine')])
  counts.value = { pending: p.length, mine: m.filter((r) => r.status === 'IN_REVIEW').length }
}
onMounted(() => Promise.all([load(), loadCounts()]))
watch(tab, load)
let timer: ReturnType<typeof setTimeout> | undefined
watch(keyword, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 300)
})

const waitText = (r: ApprovalRow) => (r.dueAt ? (r.overdue ? '已超时' : `限 ${dt(r.dueAt)} 前`) : '')

const columns = computed<DataTableColumns<ApprovalRow>>(() => {
  const base: DataTableColumns<ApprovalRow> = [
    { key: 'businessLabel', title: '类型', width: 100 },
    { key: 'title', title: '单据', minWidth: 160, render: (r) => h('a', { style: 'cursor:pointer;color:#2080f0', onClick: () => open(r) }, r.title) },
  ]
  if (tab.value === 'pending')
    base.push(
      { key: 'initiatorName', title: '提交人', width: 90 },
      { key: 'nodeName', title: '当前环节', width: 110 },
      { key: 'arrivedAt', title: '收到时间', width: 140, render: (r) => dt(r.arrivedAt) },
      { key: 'due', title: '时效', width: 160, render: (r) => h('span', { style: r.overdue ? 'color:#d03050;font-weight:600' : 'color:#888' }, [waitText(r) || '不限时', r.urgeCount ? `（被催办 ${r.urgeCount} 次）` : '']) },
    )
  else if (tab.value === 'mine')
    base.push(
      { key: 'status', title: '状态', width: 90, render: (r) => renderStatusBadge(r.status, WORKFLOW_INSTANCE_STATUS_MAP) },
      { key: 'waiting', title: '当前在谁手上', minWidth: 160, render: (r) => (r.status === 'IN_REVIEW' ? `${r.nodeName}：${(r.waitingFor ?? []).join('、')}` : '-') },
      { key: 'due', title: '时效', width: 120, render: (r) => (r.status === 'IN_REVIEW' ? h('span', { style: r.overdue ? 'color:#d03050;font-weight:600' : 'color:#888' }, waitText(r) || '不限时') : '') },
      { key: 'submittedAt', title: '提交时间', width: 140, render: (r) => dt(r.submittedAt) },
    )
  else
    base.push(
      { key: 'initiatorName', title: '提交人', width: 90 },
      { key: 'status', title: '单据状态', width: 90, render: (r) => renderStatusBadge(r.status, WORKFLOW_INSTANCE_STATUS_MAP) },
      ...(tab.value === 'done' ? [{ key: 'my', title: '我的处理', width: 150, render: (r: ApprovalRow) => h('span', null, [r.myStatus ? renderStatusBadge(r.myStatus, APPROVER_STATUS_MAP) : '', r.myComment ? ` ${r.myComment}` : '']) }] : []),
      { key: 'time', title: tab.value === 'done' ? '处理时间' : '提交时间', width: 140, render: (r) => dt(tab.value === 'done' ? r.actedAt : r.submittedAt) },
    )
  base.push({ key: 'actions', title: '操作', width: 90, fixed: 'right', render: (r) => h(NButton, { size: 'small', type: tab.value === 'pending' ? 'primary' : 'default', onClick: () => open(r) }, { default: () => (tab.value === 'pending' ? '去审批' : '查看') }) })
  return base
})
</script>

<template>
  <div>
    <n-tabs v-model:value="tab" type="line" animated>
      <n-tab-pane name="pending" :tab="`待我审批${counts.pending ? `（${counts.pending}）` : ''}`" />
      <n-tab-pane name="mine" :tab="`我发起的${counts.mine ? `（审批中 ${counts.mine}）` : ''}`" />
      <n-tab-pane name="done" tab="我已处理" />
      <n-tab-pane name="cc" tab="抄送我的" />
    </n-tabs>
    <n-space style="margin: 8px 0 12px">
      <n-input v-model:value="keyword" clearable placeholder="搜索单号 / 类型" style="width: min(260px, 70vw)" />
    </n-space>

    <template v-if="isMobile">
      <n-empty v-if="!loading && rows.length === 0" description="暂无记录" />
      <div v-for="r in rows" :key="r.instanceId + tab" class="ac-card" @click="open(r)">
        <div class="ac-top">
          <b>{{ r.businessLabel }}</b>
          <span class="ac-sub">{{ r.title }}</span>
          <component :is="() => (tab === 'pending' ? null : renderStatusBadge(r.status, WORKFLOW_INSTANCE_STATUS_MAP))" />
        </div>
        <div v-if="tab === 'pending'" class="ac-line">
          {{ r.initiatorName }} 提交 · {{ r.nodeName }} · 收到 {{ dt(r.arrivedAt) }}
          <n-tag v-if="r.overdue" size="small" type="error" style="margin-left: 6px">已超时</n-tag>
          <n-tag v-else-if="r.dueAt" size="small" type="warning" style="margin-left: 6px">{{ waitText(r) }}</n-tag>
          <n-tag v-if="r.urgeCount" size="small" type="warning" style="margin-left: 6px">被催办 {{ r.urgeCount }} 次</n-tag>
        </div>
        <div v-else-if="tab === 'mine'" class="ac-line">{{ r.status === 'IN_REVIEW' ? `${r.nodeName}：${(r.waitingFor ?? []).join('、')}` : '' }} · {{ dt(r.submittedAt) }}</div>
        <div v-else class="ac-line">{{ r.initiatorName }} 提交 · {{ dt(tab === 'done' ? r.actedAt : r.submittedAt) }}</div>
      </div>
    </template>
    <n-data-table v-else :columns="columns" :data="rows" :loading="loading" :row-key="(r: ApprovalRow) => r.instanceId + tab" :scroll-x="900" />
  </div>
</template>

<style scoped>
.ac-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.ac-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-top > :last-child {
  margin-left: auto;
}
.ac-sub {
  color: #888;
  font-size: 12px;
}
.ac-line {
  margin-top: 4px;
  color: #555;
  font-size: 12px;
}
</style>
