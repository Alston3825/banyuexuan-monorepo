<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { leaveRequestApi } from '../../api/modules/office.api'
import { employeeProfileApi } from '../../api/modules/hr.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { LeaveRequest } from '../../api/types/office'
import type { EmployeeProfile } from '../../api/types/hr'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, OFFICE_APPROVAL_STATUS_MAP, LEAVE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<LeaveRequest[]>([])
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
  leaveType: 'ANNUAL' as LeaveRequest['leaveType'],
  dateRange: null as [number, number] | null,
  reason: '',
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await leaveRequestApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, employeeProfileId: null, leaveType: 'ANNUAL', dateRange: null, reason: '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.employeeProfileId || !model.value.dateRange || !model.value.reason) {
    message.error('请完整填写门店、员工、请假日期与事由')
    return
  }
  submitting.value = true
  try {
    await leaveRequestApi.create({
      storeId: model.value.storeId,
      employeeProfileId: model.value.employeeProfileId,
      leaveType: model.value.leaveType,
      startDate: new Date(model.value.dateRange[0]).toISOString(),
      endDate: new Date(model.value.dateRange[1]).toISOString(),
      reason: model.value.reason,
    })
    message.success('请假申请已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitRequest(row: LeaveRequest) {
  dialog.warning({
    title: '提交审核',
    content: '确认提交该请假申请进入审批流程？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await leaveRequestApi.submit(row.id, row.version)
      message.success('已提交审批')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: LeaveRequest) {
  const instance = await workflowInstanceApi.findByBusiness('LEAVE_REQUEST', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: LeaveRequest) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  leaveRequestApi.cancel(row.id, reason, row.version).then(() => {
    message.success('请假申请已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<LeaveRequest> = [
  { key: 'employee', title: '员工', render: (row) => `${row.employeeProfile.account.realName}（${row.employeeProfile.employeeNo}）` },
  { key: 'leaveType', title: '类型', render: (row) => LEAVE_TYPE_LABEL_MAP[row.leaveType] },
  { key: 'range', title: '请假区间', render: (row) => `${new Date(row.startDate).toLocaleDateString()} ~ ${new Date(row.endDate).toLocaleDateString()}` },
  { key: 'reason', title: '事由' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, OFFICE_APPROVAL_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitRequest(row) }, { default: () => '提交审核' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'PENDING_APPROVAL') {
        buttons.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'APPROVED') {
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
      <n-button type="primary" @click="openCreateModal">新建请假申请</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: LeaveRequest) => r.id" :scroll-x="1000" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建请假申请" style="width: min(520px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="员工"><n-select v-model:value="model.employeeProfileId" :options="employeeOptions" filterable /></n-form-item>
          <n-form-item label="类型">
            <n-select
              v-model:value="model.leaveType"
              :options="[
                { label: '病假', value: 'SICK' },
                { label: '事假', value: 'PERSONAL' },
                { label: '年假', value: 'ANNUAL' },
                { label: '其他', value: 'OTHER' },
              ]"
            />
          </n-form-item>
          <n-form-item label="请假区间"><n-date-picker v-model:value="model.dateRange" type="daterange" style="width: 100%" /></n-form-item>
          <n-form-item label="事由"><n-input v-model:value="model.reason" type="textarea" /></n-form-item>
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
