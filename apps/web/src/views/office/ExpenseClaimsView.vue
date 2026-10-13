<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, type DataTableColumns } from 'naive-ui'
import { expenseClaimApi } from '../../api/modules/office.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { ExpenseClaim } from '../../api/types/office'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, OFFICE_APPROVAL_STATUS_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<ExpenseClaim[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({ storeId: null as string | null, amountYuan: null as number | null, category: '', reason: '' })

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await expenseClaimApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, amountYuan: null, category: '', reason: '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.amountYuan || !model.value.category || !model.value.reason) {
    message.error('请完整填写门店、金额、类别与事由')
    return
  }
  submitting.value = true
  try {
    await expenseClaimApi.create({
      storeId: model.value.storeId,
      amount: toMinorUnits(model.value.amountYuan)!,
      category: model.value.category,
      reason: model.value.reason,
    })
    message.success('报销申请已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitClaim(row: ExpenseClaim) {
  dialog.warning({
    title: '提交审核',
    content: '确认提交该报销申请进入审批流程？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await expenseClaimApi.submit(row.id, row.version)
      message.success('已提交审批')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: ExpenseClaim) {
  const instance = await workflowInstanceApi.findByBusiness('EXPENSE_CLAIM', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: ExpenseClaim) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  expenseClaimApi.cancel(row.id, reason, row.version).then(() => {
    message.success('报销申请已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<ExpenseClaim> = [
  { key: 'applicant', title: '申请人', render: (row) => row.applicant.realName },
  { key: 'category', title: '类别' },
  { key: 'amount', title: '金额(元)', render: (row) => (toMajorUnits(row.amount) ?? 0).toFixed(2) },
  { key: 'reason', title: '事由' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, OFFICE_APPROVAL_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitClaim(row) }, { default: () => '提交审核' }))
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
  stores.value = await storeApi.list()
  await fetchAll()
})
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建报销申请</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ExpenseClaim) => r.id" :scroll-x="900" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建报销申请" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="金额(元)"><n-input-number v-model:value="model.amountYuan" :min="0.01" style="width: 100%" /></n-form-item>
          <n-form-item label="类别"><n-input v-model:value="model.category" placeholder="如 差旅/办公用品/招待" /></n-form-item>
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
