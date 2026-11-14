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
  NDatePicker,
  NCheckboxGroup,
  NCheckbox,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { leadApi } from '../../api/modules/lead.api'
import { accountApi } from '../../api/modules/account.api'
import { customerApi } from '../../api/modules/customer.api'
import type { Lead, LeadAppointmentType, LeadProcessResult } from '../../api/types/lead'
import type { Customer } from '../../api/types/customer'
import {
  renderStatusBadge,
  CUSTOMER_SOURCE_LABEL_MAP,
  LEAD_APPOINTMENT_TYPE_LABEL_MAP,
  LEAD_PROCESS_RESULT_LABEL_MAP,
  LEAD_PROCESSED_MAP,
} from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<Lead[]>([])
const loading = ref(false)

const accountOptions = ref<{ label: string; value: string }[]>([])
const accountNameById = ref<Record<string, string>>({})
const customerOptions = ref<{ label: string; value: string }[]>([])
const customerById = ref<Record<string, Customer>>({})

const sourceOptions = Object.entries(CUSTOMER_SOURCE_LABEL_MAP).map(([value, label]) => ({ label, value }))
const appointmentTypeOptions = Object.entries(LEAD_APPOINTMENT_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))
const processResultOptions = Object.entries(LEAD_PROCESS_RESULT_LABEL_MAP).map(([value, label]) => ({ label, value }))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await leadApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const [accounts, customers] = await Promise.all([accountApi.list(), customerApi.list()])
  accountOptions.value = accounts.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
  accountNameById.value = Object.fromEntries(accounts.map((a) => [a.id, a.realName]))
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
  customerById.value = Object.fromEntries(customers.map((c) => [c.id, c]))
}

function fmtDateTime(v: string | null, kind: 'date' | 'time' | 'both' = 'both') {
  if (!v) return '-'
  const d = new Date(v)
  if (kind === 'date') return d.toLocaleDateString()
  if (kind === 'time') return d.toLocaleTimeString()
  return d.toLocaleString()
}

// ---------------- 新建客户线索（预约登记） ----------------
const formVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({
  name: '',
  phone: '',
  source: 'WALK_IN' as Lead['source'],
  appointmentType: undefined as LeadAppointmentType | undefined,
  appointmentTime: null as number | null,
  appointmentNote: '',
  remark: '',
})

function openCreateModal() {
  model.value = {
    name: '',
    phone: '',
    source: 'WALK_IN',
    appointmentType: undefined,
    appointmentTime: null,
    appointmentNote: '',
    remark: '',
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    await leadApi.create({
      name: model.value.name,
      phone: model.value.phone,
      source: model.value.source,
      appointmentType: model.value.appointmentType,
      appointmentTime: model.value.appointmentTime ? new Date(model.value.appointmentTime).toISOString() : undefined,
      appointmentNote: model.value.appointmentNote || undefined,
      remark: model.value.remark || undefined,
    })
    message.success('客户线索已创建')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 分配（处理人/母婴顾问） ----------------
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
    message.error('请选择处理人')
    return
  }
  assignSubmitting.value = true
  try {
    await leadApi.assign(assignTarget.value.id, assignAccountId.value, assignTarget.value.version)
    message.success('已分配处理人')
    assignVisible.value = false
    await fetchList()
  } finally {
    assignSubmitting.value = false
  }
}

// ---------------- 处理（处理结果/处理说明/关联客户，提交即标记为已处理） ----------------
const processVisible = ref(false)
const processTarget = ref<Lead | null>(null)
const processSubmitting = ref(false)
const processModel = ref({
  processResults: [] as LeadProcessResult[],
  handleRemark: '',
  customerId: undefined as string | undefined,
})

function openProcess(row: Lead) {
  processTarget.value = row
  processModel.value = {
    processResults: row.processResults ?? [],
    handleRemark: row.handleRemark ?? '',
    customerId: row.customerId ?? undefined,
  }
  processVisible.value = true
}

async function handleProcessSubmit() {
  if (!processTarget.value) return
  processSubmitting.value = true
  try {
    await leadApi.update(processTarget.value.id, {
      processed: true,
      processResults: processModel.value.processResults,
      handleRemark: processModel.value.handleRemark || undefined,
      customerId: processModel.value.customerId,
      version: processTarget.value.version,
    })
    message.success('已保存处理结果')
    processVisible.value = false
    await fetchList()
  } finally {
    processSubmitting.value = false
  }
}

const columns: DataTableColumns<Lead> = [
  { key: 'source', title: '客户来源', width: 100, render: (row) => CUSTOMER_SOURCE_LABEL_MAP[row.source] ?? row.source },
  {
    key: 'appointmentType',
    title: '预约类型',
    width: 100,
    render: (row) => (row.appointmentType ? LEAD_APPOINTMENT_TYPE_LABEL_MAP[row.appointmentType] ?? row.appointmentType : '-'),
  },
  { key: 'name', title: '客户姓名', width: 90 },
  { key: 'phone', title: '电话', width: 120 },
  { key: 'appointmentTime', title: '预约到店时间', width: 150, render: (row) => fmtDateTime(row.appointmentTime) },
  { key: 'submittedDate', title: '预约提交日期', width: 110, render: (row) => fmtDateTime(row.createdAt, 'date') },
  { key: 'submittedTime', title: '预约提交时间', width: 100, render: (row) => fmtDateTime(row.createdAt, 'time') },
  { key: 'appointmentNote', title: '预约说明', width: 160, ellipsis: { tooltip: true }, render: (row) => row.appointmentNote ?? '-' },
  { key: 'processed', title: '处理状态', width: 90, render: (row) => renderStatusBadge(String(row.processed), LEAD_PROCESSED_MAP) },
  {
    key: 'processResults',
    title: '处理结果',
    width: 180,
    render: (row) =>
      row.processResults?.length
        ? h(
            NSpace,
            { size: [4, 4] },
            { default: () => row.processResults!.map((r) => h('span', { key: r }, LEAD_PROCESS_RESULT_LABEL_MAP[r] ?? r)) },
          )
        : '-',
  },
  {
    key: 'customerId',
    title: '关联客户',
    width: 100,
    render: (row) =>
      row.customerId
        ? h(NButton, { text: true, type: 'primary', onClick: () => router.push(`/crm/customers/${row.customerId}`) }, { default: () => customerById.value[row.customerId!]?.name ?? '查看' })
        : '-',
  },
  {
    key: 'expectedDueDate',
    title: '预产期',
    width: 110,
    render: (row) => {
      const c = row.customerId ? customerById.value[row.customerId] : undefined
      return c?.expectedDueDate ? new Date(c.expectedDueDate).toLocaleDateString() : '-'
    },
  },
  {
    key: 'assignedToId',
    title: '处理人（母婴顾问）',
    width: 130,
    render: (row) => (row.assignedToId ? accountNameById.value[row.assignedToId] ?? row.assignedToId : '-'),
  },
  { key: 'handleRemark', title: '处理说明', width: 160, ellipsis: { tooltip: true }, render: (row) => row.handleRemark ?? '-' },
  {
    key: 'actions',
    title: '操作',
    width: 200,
    fixed: 'right',
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openAssign(row) }, { default: () => '分配' }),
          h(NButton, { size: 'small', type: 'primary', onClick: () => openProcess(row) }, { default: () => '处理' }),
          h(NButton, { size: 'small', onClick: () => router.push(`/crm/leads/${row.id}`) }, { default: () => '详情' }),
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
      <n-button type="primary" @click="openCreateModal">新建客户线索</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Lead) => r.id" :scroll-x="1900" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建客户线索" style="width: min(460px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item label="姓名" path="name" :rule="{ required: true, message: '请输入姓名' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="手机号" path="phone" :rule="{ required: true, message: '请输入手机号' }">
            <n-input v-model:value="model.phone" />
          </n-form-item>
          <n-form-item label="客户来源" path="source">
            <n-select v-model:value="model.source" :options="sourceOptions" />
          </n-form-item>
          <n-form-item label="预约类型" path="appointmentType">
            <n-select v-model:value="model.appointmentType" :options="appointmentTypeOptions" clearable placeholder="预约参观/预约试餐" />
          </n-form-item>
          <n-form-item label="预约到店时间" path="appointmentTime">
            <n-date-picker v-model:value="model.appointmentTime" type="datetime" style="width: 100%" clearable />
          </n-form-item>
          <n-form-item label="预约说明" path="appointmentNote">
            <n-input v-model:value="model.appointmentNote" type="textarea" />
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

    <n-modal :mask-closable="false" :show="assignVisible" @update:show="(v) => (assignVisible = v)">
      <n-card title="分配处理人" style="width: min(380px, 94vw)" :bordered="false" role="dialog" closable @close="assignVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="处理人">
            <n-select v-model:value="assignAccountId" :options="accountOptions" placeholder="选择母婴顾问" />
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

    <n-modal :mask-closable="false" :show="processVisible" @update:show="(v) => (processVisible = v)">
      <n-card title="处理客户线索" style="width: min(460px, 94vw)" :bordered="false" role="dialog" closable @close="processVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="处理结果">
            <n-checkbox-group v-model:value="processModel.processResults">
              <n-space :size="[12, 8]">
                <n-checkbox v-for="opt in processResultOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
              </n-space>
            </n-checkbox-group>
          </n-form-item>
          <n-form-item label="关联客户">
            <n-select v-model:value="processModel.customerId" :options="customerOptions" filterable clearable placeholder="搜索姓名/手机号关联已有客户" />
          </n-form-item>
          <n-form-item label="处理说明">
            <n-input v-model:value="processModel.handleRemark" type="textarea" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="processVisible = false">取消</n-button>
            <n-button type="primary" :loading="processSubmitting" @click="handleProcessSubmit">保存（标记为已处理）</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
