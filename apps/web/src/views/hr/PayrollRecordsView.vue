<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { payrollRecordApi, employeeProfileApi } from '../../api/modules/hr.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { PayrollRecord, EmployeeProfile } from '../../api/types/hr'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, PAYROLL_RECORD_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<PayrollRecord[]>([])
const stores = ref<Store[]>([])
const employeeProfiles = ref<EmployeeProfile[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const employeeOptions = computed(() => employeeProfiles.value.map((e) => ({ label: `${e.account.realName}（${e.employeeNo}）`, value: e.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  employeeProfileId: null as string | null,
  periodMs: null as number | null,
  baseSalary: 0,
  deductions: 0,
  remark: '',
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await payrollRecordApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, employeeProfileId: null, periodMs: Date.now(), baseSalary: 0, deductions: 0, remark: '' }
  formVisible.value = true
}

function msToPeriod(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.employeeProfileId || !model.value.periodMs) {
    message.error('请完整选择门店、员工与薪资周期')
    return
  }
  submitting.value = true
  try {
    await payrollRecordApi.create({
      storeId: model.value.storeId,
      employeeProfileId: model.value.employeeProfileId,
      period: msToPeriod(model.value.periodMs),
      baseSalary: model.value.baseSalary,
      deductions: model.value.deductions || undefined,
      remark: model.value.remark || undefined,
    })
    message.success('薪资记录已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitRecord(row: PayrollRecord) {
  dialog.warning({
    title: '提交审核',
    content: '确认提交该薪资记录进入审批流程？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await payrollRecordApi.submit(row.id, row.version)
      message.success('已提交审批')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: PayrollRecord) {
  const instance = await workflowInstanceApi.findByBusiness('HR_PAYROLL', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleMarkPaid(row: PayrollRecord) {
  dialog.warning({
    title: '标记已发放',
    content: `确认标记「${row.employeeProfile.account.realName}」${row.period} 薪资已发放？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await payrollRecordApi.markPaid(row.id, row.version)
      message.success('已标记为已发放')
      await fetchAll()
    },
  })
}

function handleCancel(row: PayrollRecord) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  payrollRecordApi.cancel(row.id, reason, row.version).then(() => {
    message.success('薪资记录已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<PayrollRecord> = [
  { key: 'employee', title: '员工', render: (row) => `${row.employeeProfile.account.realName}（${row.employeeProfile.employeeNo}）` },
  { key: 'period', title: '周期' },
  { key: 'baseSalary', title: '底薪(分)' },
  { key: 'commissionTotal', title: '提成合计(分)' },
  { key: 'deductions', title: '扣款(分)' },
  { key: 'netAmount', title: '实发(分)' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, PAYROLL_RECORD_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 240,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitRecord(row) }, { default: () => '提交审核' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'PENDING_APPROVAL') {
        buttons.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'APPROVED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleMarkPaid(row) }, { default: () => '标记已发放' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      }
      return h(NSpace, {}, { default: () => buttons })
    },
  },
]

onMounted(async () => {
  const [storeList, profiles] = await Promise.all([storeApi.list(), employeeProfileApi.list()])
  stores.value = storeList
  employeeProfiles.value = profiles
  await fetchAll()
})
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建薪资记录</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: PayrollRecord) => r.id" :scroll-x="1100" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建薪资记录" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="员工"><n-select v-model:value="model.employeeProfileId" :options="employeeOptions" filterable /></n-form-item>
          <n-form-item label="薪资周期"><n-date-picker v-model:value="model.periodMs" type="month" style="width: 100%" /></n-form-item>
          <n-form-item label="底薪(分)"><n-input-number v-model:value="model.baseSalary" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item label="扣款(分)"><n-input-number v-model:value="model.deductions" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
