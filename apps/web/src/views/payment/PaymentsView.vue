<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, type DataTableColumns } from 'naive-ui'
import { paymentApi } from '../../api/modules/payment.api'
import { contractApi } from '../../api/modules/contract.api'
import { customerApi } from '../../api/modules/customer.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import type { Payment } from '../../api/types/payment'
import type { Contract } from '../../api/types/contract'
import { renderStatusBadge, PAYMENT_STATUS_MAP, PAYMENT_METHOD_LABEL_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<Payment[]>([])
const loading = ref(false)

const contractOptions = ref<{ label: string; value: string }[]>([])
const contractById = ref<Record<string, Contract>>({})
const customerNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await paymentApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const [contracts, customers] = await Promise.all([contractApi.list(), customerApi.list()])
  customerNameById.value = Object.fromEntries(customers.map((c) => [c.id, c.name]))
  contractById.value = Object.fromEntries(contracts.map((c) => [c.id, c]))
  // 只有已确认、已关联客户的合同才能登记收款
  contractOptions.value = contracts
    .filter((c) => c.status === 'ACTIVE' && c.customerId)
    .map((c) => ({
      label: `${c.paperNo || c.contractNo}（${customerNameById.value[c.customerId!] ?? c.clientName ?? c.customerId}）`,
      value: c.id,
    }))
}

// ---------------- 新建收款 ----------------
const formVisible = ref(false)
const submitting = ref(false)
const model = ref({ contractId: null as string | null, amountYuan: null as number | null, method: 'CASH', remark: '' })

function openCreateModal() {
  model.value = { contractId: null, amountYuan: null, method: 'CASH', remark: '' }
  formVisible.value = true
}

async function handleSubmit() {
  const contract = model.value.contractId ? contractById.value[model.value.contractId] : null
  if (!contract || !contract.customerId || !model.value.amountYuan) {
    message.error('请选择合同并填写金额')
    return
  }
  submitting.value = true
  try {
    await paymentApi.create({
      contractId: contract.id,
      customerId: contract.customerId,
      storeId: contract.storeId,
      amount: toMinorUnits(model.value.amountYuan)!,
      method: model.value.method as Payment['method'],
      remark: model.value.remark || undefined,
    })
    message.success('收款已登记')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 退款申请 ----------------
const refundVisible = ref(false)
const refundTarget = ref<Payment | null>(null)
const refundReason = ref('')
const refundSubmitting = ref(false)

function openRefundModal(row: Payment) {
  refundTarget.value = row
  refundReason.value = ''
  refundVisible.value = true
}

async function handleRequestRefund() {
  if (!refundTarget.value) return
  if (!refundReason.value.trim()) {
    message.error('请填写退款原因')
    return
  }
  refundSubmitting.value = true
  try {
    await paymentApi.requestRefund(refundTarget.value.id, refundReason.value, refundTarget.value.version)
    message.success('退款申请已提交')
    refundVisible.value = false
    await fetchList()
  } finally {
    refundSubmitting.value = false
  }
}

async function viewApprovalProgress(row: Payment) {
  const instance = await workflowInstanceApi.findByBusiness('PAYMENT', row.id)
  if (!instance) {
    message.error('未找到关联的审批流程')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

const columns: DataTableColumns<Payment> = [
  { key: 'paymentNo', title: '收款单号' },
  {
    key: 'contractId',
    title: '关联合同',
    render: (row) => h(RouterLink, { to: `/contract/records/${row.contractId}` }, { default: () => (contractById.value[row.contractId]?.paperNo || contractById.value[row.contractId]?.contractNo) ?? row.contractId }),
  },
  { key: 'customerId', title: '客户', render: (row) => customerNameById.value[row.customerId] ?? row.customerId },
  { key: 'amount', title: '金额（元）', render: (row) => toMajorUnits(row.amount) },
  { key: 'method', title: '方式', render: (row) => PAYMENT_METHOD_LABEL_MAP[row.method] ?? row.method },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, PAYMENT_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 140,
    render: (row) => {
      if (row.status === 'RECORDED') {
        return h(NButton, { size: 'small', onClick: () => openRefundModal(row) }, { default: () => '退款申请' })
      }
      if (row.status === 'PENDING_REFUND') {
        return h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' })
      }
      return null
    },
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
      <n-button type="primary" @click="openCreateModal">登记收款</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Payment) => r.id" :scroll-x="1000" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="登记收款" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="合同"><n-select v-model:value="model.contractId" :options="contractOptions" filterable /></n-form-item>
          <n-form-item label="金额（元）"><n-input-number v-model:value="model.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="收款方式">
            <n-select
              v-model:value="model.method"
              :options="[
                { label: '现金', value: 'CASH' },
                { label: '银行转账', value: 'BANK_TRANSFER' },
                { label: '微信', value: 'WECHAT' },
                { label: '支付宝', value: 'ALIPAY' },
                { label: 'POS 刷卡', value: 'POS_CARD' },
                { label: '其他', value: 'OTHER' },
              ]"
            />
          </n-form-item>
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

    <n-modal :show="refundVisible" @update:show="(v) => (refundVisible = v)">
      <n-card title="申请退款" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="退款原因"><n-input v-model:value="refundReason" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="refundVisible = false">取消</n-button>
            <n-button type="error" :loading="refundSubmitting" @click="handleRequestRefund">提交申请</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
