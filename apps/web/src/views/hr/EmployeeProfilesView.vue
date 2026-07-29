<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, NSwitch, NTag, type DataTableColumns } from 'naive-ui'
import { employeeProfileApi } from '../../api/modules/hr.api'
import { accountApi } from '../../api/modules/account.api'
import type { EmployeeProfile, EmployeeProfileExpiryAlert } from '../../api/types/hr'
import type { Account } from '../../api/types/account'
import { renderStatusBadge, EMPLOYEE_PROFILE_STATUS_MAP, EMPLOYMENT_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const ALERT_TYPE_LABEL_MAP: Record<string, string> = { HEALTH_CERT: '健康证', CONTRACT: '合同', PROBATION: '转正' }

const rows = ref<EmployeeProfile[]>([])
const alertRows = ref<EmployeeProfileExpiryAlert[]>([])
const accounts = ref<Account[]>([])
const loading = ref(false)
const alertsOnly = ref(false)

const accountsWithoutProfile = computed(() => {
  const profiledIds = new Set(rows.value.map((p) => p.accountId))
  return accounts.value.filter((a) => !profiledIds.has(a.id))
})
const accountOptions = computed(() => accountsWithoutProfile.value.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id })))

async function fetchList() {
  loading.value = true
  try {
    if (alertsOnly.value) {
      alertRows.value = await employeeProfileApi.expiryAlerts(30)
    } else {
      rows.value = await employeeProfileApi.list()
    }
  } finally {
    loading.value = false
  }
}

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  accountId: null as string | null,
  employeeNo: '',
  hireDate: null as number | null,
  healthCertExpiresAt: null as number | null,
  contractExpiresAt: null as number | null,
  probationEndsAt: null as number | null,
  remark: '',
})

function openCreateModal() {
  model.value = { accountId: null, employeeNo: '', hireDate: Date.now(), healthCertExpiresAt: null, contractExpiresAt: null, probationEndsAt: null, remark: '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.accountId || !model.value.employeeNo || !model.value.hireDate) {
    message.error('请选择账号、填写工号与入职日期')
    return
  }
  submitting.value = true
  try {
    await employeeProfileApi.create({
      accountId: model.value.accountId,
      employeeNo: model.value.employeeNo,
      hireDate: new Date(model.value.hireDate).toISOString(),
      healthCertExpiresAt: model.value.healthCertExpiresAt ? new Date(model.value.healthCertExpiresAt).toISOString() : undefined,
      contractExpiresAt: model.value.contractExpiresAt ? new Date(model.value.contractExpiresAt).toISOString() : undefined,
      probationEndsAt: model.value.probationEndsAt ? new Date(model.value.probationEndsAt).toISOString() : undefined,
      remark: model.value.remark || undefined,
    })
    message.success('员工档案已建立')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 编辑（到期日期/状态维护） ----------------
const editVisible = ref(false)
const editSubmitting = ref(false)
const editingRow = ref<EmployeeProfile | null>(null)
const editModel = ref({
  healthCertExpiresAt: null as number | null,
  contractExpiresAt: null as number | null,
  probationEndsAt: null as number | null,
  status: 'ACTIVE' as EmployeeProfile['status'],
  remark: '',
})

function openEditModal(row: EmployeeProfile) {
  editingRow.value = row
  editModel.value = {
    healthCertExpiresAt: row.healthCertExpiresAt ? new Date(row.healthCertExpiresAt).getTime() : null,
    contractExpiresAt: row.contractExpiresAt ? new Date(row.contractExpiresAt).getTime() : null,
    probationEndsAt: row.probationEndsAt ? new Date(row.probationEndsAt).getTime() : null,
    status: row.status,
    remark: row.remark ?? '',
  }
  editVisible.value = true
}

async function handleEditSubmit() {
  if (!editingRow.value) return
  editSubmitting.value = true
  try {
    await employeeProfileApi.update(editingRow.value.id, {
      healthCertExpiresAt: editModel.value.healthCertExpiresAt ? new Date(editModel.value.healthCertExpiresAt).toISOString() : undefined,
      contractExpiresAt: editModel.value.contractExpiresAt ? new Date(editModel.value.contractExpiresAt).toISOString() : undefined,
      probationEndsAt: editModel.value.probationEndsAt ? new Date(editModel.value.probationEndsAt).toISOString() : undefined,
      status: editModel.value.status,
      remark: editModel.value.remark || undefined,
      version: editingRow.value.version,
    })
    message.success('员工档案已更新')
    editVisible.value = false
    await fetchList()
  } finally {
    editSubmitting.value = false
  }
}

const columns: DataTableColumns<EmployeeProfile> = [
  { key: 'realName', title: '姓名', render: (row) => row.account.realName },
  { key: 'employeeNo', title: '工号' },
  { key: 'employmentType', title: '用工性质', render: (row) => EMPLOYMENT_TYPE_LABEL_MAP[row.employmentType] },
  { key: 'hireDate', title: '入职日期', render: (row) => new Date(row.hireDate).toLocaleDateString() },
  { key: 'healthCertExpiresAt', title: '健康证到期', render: (row) => (row.healthCertExpiresAt ? new Date(row.healthCertExpiresAt).toLocaleDateString() : '-') },
  { key: 'contractExpiresAt', title: '合同到期', render: (row) => (row.contractExpiresAt ? new Date(row.contractExpiresAt).toLocaleDateString() : '-') },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, EMPLOYEE_PROFILE_STATUS_MAP) },
  { key: 'actions', title: '操作', width: 100, render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }) },
]

const alertColumns: DataTableColumns<EmployeeProfileExpiryAlert> = [
  { key: 'realName', title: '姓名', render: (row) => row.account.realName },
  { key: 'employeeNo', title: '工号' },
  {
    key: 'alerts',
    title: '到期提醒',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () =>
            row.alerts.map((a) =>
              h(NTag, { key: a.type, size: 'small', type: a.isExpired ? 'error' : 'warning' }, { default: () => `${ALERT_TYPE_LABEL_MAP[a.type]}：${new Date(a.expiresAt).toLocaleDateString()}${a.isExpired ? '(已过期)' : ''}` }),
            ),
        },
      ),
  },
]

onMounted(async () => {
  accounts.value = await accountApi.list()
  await fetchList()
})
watch(alertsOnly, fetchList)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" align="center">
      <n-space align="center" :size="8">
        <n-switch v-model:value="alertsOnly" />
        <span>只看到期提醒（30天内）</span>
      </n-space>
      <n-button type="primary" @click="openCreateModal">建立员工档案</n-button>
    </n-space>
    <n-data-table v-if="!alertsOnly" :columns="columns" :data="rows" :loading="loading" :row-key="(r: EmployeeProfile) => r.id" :scroll-x="1000" />
    <n-data-table v-else :columns="alertColumns" :data="alertRows" :loading="loading" :row-key="(r: EmployeeProfileExpiryAlert) => r.id" :scroll-x="700" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="建立员工档案" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="110">
          <n-form-item label="账号"><n-select v-model:value="model.accountId" :options="accountOptions" filterable placeholder="仅显示尚未建档的账号" /></n-form-item>
          <n-form-item label="工号"><n-input v-model:value="model.employeeNo" /></n-form-item>
          <n-form-item label="入职日期"><n-date-picker v-model:value="model.hireDate" type="date" style="width: 100%" /></n-form-item>
          <n-form-item label="健康证到期"><n-date-picker v-model:value="model.healthCertExpiresAt" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="合同到期"><n-date-picker v-model:value="model.contractExpiresAt" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="转正日期"><n-date-picker v-model:value="model.probationEndsAt" type="date" style="width: 100%" clearable /></n-form-item>
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

    <n-modal :show="editVisible" @update:show="(v) => (editVisible = v)">
      <n-card title="编辑员工档案" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="110">
          <n-form-item label="健康证到期"><n-date-picker v-model:value="editModel.healthCertExpiresAt" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="合同到期"><n-date-picker v-model:value="editModel.contractExpiresAt" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="转正日期"><n-date-picker v-model:value="editModel.probationEndsAt" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="状态">
            <n-select
              v-model:value="editModel.status"
              :options="[
                { label: '在职', value: 'ACTIVE' },
                { label: '休假中', value: 'ON_LEAVE' },
                { label: '已离职', value: 'TERMINATED' },
              ]"
            />
          </n-form-item>
          <n-form-item label="备注"><n-input v-model:value="editModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="editVisible = false">取消</n-button>
            <n-button type="primary" :loading="editSubmitting" @click="handleEditSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
