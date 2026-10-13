<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDynamicInput, type DataTableColumns } from 'naive-ui'
import { commissionRecordApi, employeeProfileApi } from '../../api/modules/hr.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { CommissionRecord, CommissionAllocationInput, EmployeeProfile } from '../../api/types/hr'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, COMMISSION_RECORD_STATUS_MAP, COMMISSION_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<CommissionRecord[]>([])
const stores = ref<Store[]>([])
const employeeProfiles = ref<EmployeeProfile[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const employeeOptions = computed(() => employeeProfiles.value.map((e) => ({ label: `${e.account.realName}（${e.employeeNo}）`, value: e.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  type: 'SALES' as 'SALES' | 'LABOR',
  sourceType: '',
  sourceId: '',
  totalAmount: 0,
  remark: '',
  allocations: [] as (CommissionAllocationInput & { key: number })[],
})
let allocRowKey = 0

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await commissionRecordApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, type: 'SALES', sourceType: '', sourceId: '', totalAmount: 0, remark: '', allocations: [] }
  formVisible.value = true
}

function createAllocRow() {
  return { key: allocRowKey++, employeeProfileId: '', roleLabel: '', basisPoints: 0 }
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.sourceType || !model.value.sourceId || model.value.totalAmount <= 0 || model.value.allocations.length === 0) {
    message.error('请完整填写门店/来源单据类型/来源单据号/提成总金额，并至少添加一行分配明细')
    return
  }
  submitting.value = true
  try {
    await commissionRecordApi.create({
      storeId: model.value.storeId,
      type: model.value.type,
      sourceType: model.value.sourceType,
      sourceId: model.value.sourceId,
      totalAmount: model.value.totalAmount,
      remark: model.value.remark || undefined,
      allocations: model.value.allocations.map(({ key: _key, ...a }) => a),
    })
    message.success('提成记录已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitRecord(row: CommissionRecord) {
  dialog.warning({
    title: '提交审核',
    content: '确认提交该提成记录进入审批流程？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await commissionRecordApi.submit(row.id, row.version)
      message.success('已提交审批')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: CommissionRecord) {
  const instance = await workflowInstanceApi.findByBusiness('HR_COMMISSION', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: CommissionRecord) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  commissionRecordApi.cancel(row.id, reason, row.version).then(() => {
    message.success('提成记录已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<CommissionRecord> = [
  { key: 'type', title: '类型', render: (row) => COMMISSION_TYPE_LABEL_MAP[row.type] },
  { key: 'sourceType', title: '来源单据类型' },
  { key: 'sourceId', title: '来源单据号' },
  { key: 'totalAmount', title: '总金额(分)', render: (row) => row.totalAmount },
  { key: 'allocations', title: '分配明细', render: (row) => row.allocations.map((a) => `${a.employeeProfile.account.realName}(${a.roleLabel}):${a.amount}`).join('；') },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMISSION_RECORD_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitRecord(row) }, { default: () => '提交审核' }))
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
      <n-button type="primary" @click="openCreateModal">新建提成记录</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: CommissionRecord) => r.id" :scroll-x="1100" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建提成记录" style="width: min(680px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="110">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="类型">
            <n-select
              v-model:value="model.type"
              :options="[
                { label: '业绩提成', value: 'SALES' },
                { label: '手工费', value: 'LABOR' },
              ]"
            />
          </n-form-item>
          <n-form-item label="来源单据类型"><n-input v-model:value="model.sourceType" placeholder="如 PAYMENT / SERVICE_APPOINTMENT" /></n-form-item>
          <n-form-item label="来源单据号"><n-input v-model:value="model.sourceId" placeholder="关联单据 ID" /></n-form-item>
          <n-form-item label="提成总金额(分)"><n-input-number v-model:value="model.totalAmount" :min="1" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="分配明细">
            <n-dynamic-input v-model:value="model.allocations" :on-create="createAllocRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-select v-model:value="value.employeeProfileId" :options="employeeOptions" filterable placeholder="员工" style="width: min(200px, 94vw)" />
                <n-input v-model:value="value.roleLabel" placeholder="角色说明，如 主护/助理" style="width: min(160px, 94vw)" />
                <n-input-number v-model:value="value.basisPoints" :min="0" :max="10000" placeholder="分配比例(万分比)" style="width: min(160px, 94vw)" />
              </n-space>
            </n-dynamic-input>
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
  </div>
</template>
