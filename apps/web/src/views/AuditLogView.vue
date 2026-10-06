<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NCard, NSpace, NInput, NSelect, NDataTable, NButton, NModal, NCode, type DataTableColumns } from 'naive-ui'
import { auditLogApi } from '../api/modules/audit-log.api'
import type { AuditAction, AuditLog } from '../api/types/audit-log'

const rows = ref<AuditLog[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)

const filters = ref<{ entityType: string; entityId: string; accountId: string; action: AuditAction | null }>({
  entityType: '',
  entityId: '',
  accountId: '',
  action: null,
})

const actionOptions = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'STATE_TRANSITION',
  'APPROVE',
  'REJECT',
  'WITHDRAW',
  'REASSIGN',
  'ADD_APPROVER',
  'CC',
  'ARCHIVE',
  'SENSITIVE_QUERY',
  'EXPORT',
  'PRINT',
].map((a) => ({ label: a, value: a }))

async function fetchList() {
  loading.value = true
  try {
    const result = await auditLogApi.list({
      entityType: filters.value.entityType || undefined,
      entityId: filters.value.entityId || undefined,
      accountId: filters.value.accountId || undefined,
      action: filters.value.action ?? undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    rows.value = result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchList()
}

function handlePageChange(p: number) {
  page.value = p
  fetchList()
}

const detailVisible = ref(false)
const detailRow = ref<AuditLog | null>(null)
function openDetail(row: AuditLog) {
  detailRow.value = row
  detailVisible.value = true
}

const columns: DataTableColumns<AuditLog> = [
  { key: 'action', title: '动作' },
  { key: 'entityType', title: '实体类型' },
  { key: 'entityId', title: '实体 ID', render: (row) => row.entityId ?? '-' },
  { key: 'accountId', title: '操作人', render: (row) => row.accountId ?? '-' },
  { key: 'result', title: '结果' },
  { key: 'createdAt', title: '时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => '详情' }),
  },
]

onMounted(fetchList)
</script>

<template>
  <n-card title="审计日志">
    <n-space style="margin-bottom: 12px" :wrap="true">
      <n-input v-model:value="filters.entityType" placeholder="实体类型" style="width: min(160px, 94vw)" @keyup.enter="handleSearch" />
      <n-input v-model:value="filters.entityId" placeholder="实体 ID" style="width: min(200px, 94vw)" @keyup.enter="handleSearch" />
      <n-input v-model:value="filters.accountId" placeholder="操作人 ID" style="width: min(200px, 94vw)" @keyup.enter="handleSearch" />
      <n-select v-model:value="filters.action" :options="actionOptions" clearable placeholder="动作类型" style="width: min(180px, 94vw)" />
      <n-button type="primary" @click="handleSearch">查询</n-button>
    </n-space>

    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: AuditLog) => r.id" :scroll-x="1000" />

    <n-space justify="end" style="margin-top: 12px">
      <n-button :disabled="page <= 1" @click="handlePageChange(page - 1)">上一页</n-button>
      <span>第 {{ page }} 页 / 共 {{ Math.max(1, Math.ceil(total / pageSize)) }} 页（共 {{ total }} 条）</span>
      <n-button :disabled="page * pageSize >= total" @click="handlePageChange(page + 1)">下一页</n-button>
    </n-space>

    <n-modal :show="detailVisible" @update:show="(v) => (detailVisible = v)">
      <n-card title="审计详情" style="width: min(640px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <template v-if="detailRow">
          <p>IP：{{ detailRow.ip ?? '-' }}　User-Agent：{{ detailRow.userAgent ?? '-' }}</p>
          <p>备注：{{ detailRow.remark ?? '-' }}</p>
          <p>变更字段：{{ detailRow.changedFields?.join(', ') ?? '-' }}</p>
          <n-code :code="JSON.stringify({ before: detailRow.beforeData, after: detailRow.afterData }, null, 2)" language="json" />
        </template>
      </n-card>
    </n-modal>
  </n-card>
</template>
