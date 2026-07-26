<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NSpace,
  NDataTable,
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { leadApi } from '../../api/modules/lead.api'
import { accountApi } from '../../api/modules/account.api'
import type { Lead } from '../../api/types/lead'
import { renderStatusBadge, LEAD_STATUS_MAP, CUSTOMER_SOURCE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<Lead[]>([])
const loading = ref(false)

const accountOptions = ref<{ label: string; value: string }[]>([])
const accountNameById = ref<Record<string, string>>({})
const sourceOptions = Object.entries(CUSTOMER_SOURCE_LABEL_MAP).map(([value, label]) => ({ label, value }))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await leadApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const accounts = await accountApi.list()
  accountOptions.value = accounts.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
  accountNameById.value = Object.fromEntries(accounts.map((a) => [a.id, a.realName]))
}

// ---------------- 新建线索 ----------------
const formVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({ name: '', phone: '', source: 'WALK_IN' as Lead['source'], remark: '' })

function openCreateModal() {
  model.value = { name: '', phone: '', source: 'WALK_IN', remark: '' }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    await leadApi.create({ ...model.value, remark: model.value.remark || undefined })
    message.success('线索已创建')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 分配 ----------------
const assignVisible = ref(false)
const assignTarget = ref<Lead | null>(null)
const assignAccountId = ref<string | undefined>()
const assignSubmitting = ref(false)

function openAssign(row: Lead) {
  assignTarget.value = row
  assignAccountId.value = row.assignedToId ?? undefined
  assignVisible.value = true
}

async function handleAssign() {
  if (!assignTarget.value || !assignAccountId.value) {
    message.error('请选择负责人')
    return
  }
  assignSubmitting.value = true
  try {
    await leadApi.assign(assignTarget.value.id, assignAccountId.value, assignTarget.value.version)
    message.success('已分配')
    assignVisible.value = false
    await fetchList()
  } finally {
    assignSubmitting.value = false
  }
}

const columns: DataTableColumns<Lead> = [
  { key: 'leadNo', title: '线索编号' },
  { key: 'name', title: '姓名' },
  { key: 'phone', title: '手机号' },
  { key: 'source', title: '来源', render: (row) => CUSTOMER_SOURCE_LABEL_MAP[row.source] ?? row.source },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, LEAD_STATUS_MAP) },
  { key: 'assignedToId', title: '负责人', render: (row) => (row.assignedToId ? accountNameById.value[row.assignedToId] ?? row.assignedToId : '-') },
  {
    key: 'actions',
    title: '操作',
    width: 160,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openAssign(row) }, { default: () => '分配' }),
          h(NButton, { size: 'small', onClick: () => router.push(`/crm/leads/${row.id}`) }, { default: () => '查看详情' }),
        ],
      }),
  },
]

onMounted(async () => {
  await Promise.all([fetchList(), fetchPickerOptions()])
})
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建线索</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Lead) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建线索" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="80">
          <n-form-item label="姓名" path="name" :rule="{ required: true, message: '请输入姓名' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="手机号" path="phone" :rule="{ required: true, message: '请输入手机号' }">
            <n-input v-model:value="model.phone" />
          </n-form-item>
          <n-form-item label="来源" path="source">
            <n-select v-model:value="model.source" :options="sourceOptions" />
          </n-form-item>
          <n-form-item label="备注" path="remark">
            <n-input v-model:value="model.remark" type="textarea" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="assignVisible" @update:show="(v) => (assignVisible = v)">
      <n-card title="分配线索" style="width: 380px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="负责人">
            <n-select v-model:value="assignAccountId" :options="accountOptions" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="assignVisible = false">取消</n-button>
            <n-button type="primary" :loading="assignSubmitting" @click="handleAssign">确认</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
