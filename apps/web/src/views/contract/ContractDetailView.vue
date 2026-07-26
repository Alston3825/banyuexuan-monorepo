<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NSpace, NButton, NDescriptions, NDescriptionsItem, NModal, NForm, NFormItem, NInput, NInputNumber, NDatePicker } from 'naive-ui'
import { contractApi } from '../../api/modules/contract.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import type { Contract } from '../../api/types/contract'
import { renderStatusBadge, CONTRACT_STATUS_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message, dialog } from '../../utils/discrete-api'

const route = useRoute()
const router = useRouter()
const contractId = route.params.id as string

const contract = ref<Contract | null>(null)
const customerName = ref('')
const storeName = ref('')

async function fetchAll() {
  const c = await contractApi.get(contractId)
  contract.value = c
  const [customer, store] = await Promise.all([customerApi.get(c.customerId), storeApi.get(c.storeId)])
  customerName.value = customer.name
  storeName.value = store.name
}

// ---------------- 编辑 ----------------
const editVisible = ref(false)
const editSubmitting = ref(false)
const editModel = ref({ title: '', content: '', amountYuan: null as number | null, dateRange: null as [number, number] | null })

function openEdit() {
  if (!contract.value) return
  editModel.value = {
    title: contract.value.title,
    content: contract.value.content,
    amountYuan: toMajorUnits(contract.value.amount),
    dateRange: [new Date(contract.value.startDate).getTime(), new Date(contract.value.endDate).getTime()],
  }
  editVisible.value = true
}

async function handleEditSubmit() {
  if (!contract.value || !editModel.value.dateRange) return
  editSubmitting.value = true
  try {
    contract.value = await contractApi.update(contract.value.id, {
      title: editModel.value.title,
      content: editModel.value.content,
      amount: toMinorUnits(editModel.value.amountYuan ?? undefined),
      startDate: new Date(editModel.value.dateRange[0]).toISOString(),
      endDate: new Date(editModel.value.dateRange[1]).toISOString(),
      version: contract.value.version,
    })
    message.success('合同已更新')
    editVisible.value = false
  } finally {
    editSubmitting.value = false
  }
}

// ---------------- 签署 ----------------
function confirmSign() {
  if (!contract.value) return
  dialog.warning({
    title: '确认签署',
    content: '签署后合同正文将被锁定，不可再编辑。确认客户已签署本合同？',
    positiveText: '确认签署',
    negativeText: '取消',
    onPositiveClick: async () => {
      contract.value = await contractApi.sign(contract.value!.id, contract.value!.version)
      message.success('已确认签署')
    },
  })
}

// ---------------- 提交审核 ----------------
const submitting = ref(false)

async function handleSubmitReview() {
  if (!contract.value) return
  submitting.value = true
  try {
    contract.value = await contractApi.submit(contract.value.id, contract.value.version)
    message.success('已提交审核')
  } finally {
    submitting.value = false
  }
}

// ---------------- 查看审批进度 ----------------
async function viewApprovalProgress() {
  const instance = await workflowInstanceApi.findByBusiness('CONTRACT', contractId)
  if (!instance) {
    message.error('未找到关联的审批流程')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

// ---------------- 续签 ----------------
const renewVisible = ref(false)
const renewSubmitting = ref(false)
const renewModel = ref({ dateRange: null as [number, number] | null, amountYuan: null as number | null, content: '' })

function openRenew() {
  if (!contract.value) return
  renewModel.value = { dateRange: null, amountYuan: toMajorUnits(contract.value.amount), content: contract.value.content }
  renewVisible.value = true
}

async function handleRenew() {
  if (!contract.value || !renewModel.value.dateRange) {
    message.error('请选择新的服务起止日期')
    return
  }
  renewSubmitting.value = true
  try {
    const renewed = await contractApi.renew(contract.value.id, {
      startDate: new Date(renewModel.value.dateRange[0]).toISOString(),
      endDate: new Date(renewModel.value.dateRange[1]).toISOString(),
      amount: toMinorUnits(renewModel.value.amountYuan ?? undefined),
      content: renewModel.value.content,
      version: contract.value.version,
    })
    message.success('已生成续签合同')
    renewVisible.value = false
    router.push(`/contract/records/${renewed.id}`)
  } finally {
    renewSubmitting.value = false
  }
}

// ---------------- 作废 ----------------
const voidVisible = ref(false)
const voidReason = ref('')
const voidSubmitting = ref(false)

async function handleVoid() {
  if (!contract.value || !voidReason.value.trim()) {
    message.error('请填写作废原因')
    return
  }
  voidSubmitting.value = true
  try {
    contract.value = await contractApi.void(contract.value.id, voidReason.value, contract.value.version)
    message.success('合同已作废')
    voidVisible.value = false
  } finally {
    voidSubmitting.value = false
  }
}

onMounted(fetchAll)
</script>

<template>
  <div v-if="contract">
    <n-card :title="contract.title" style="margin-bottom: 16px">
      <template #header-extra>
        <component :is="() => renderStatusBadge(contract!.status, CONTRACT_STATUS_MAP)" />
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="合同编号">{{ contract.contractNo }}</n-descriptions-item>
        <n-descriptions-item label="客户">
          <RouterLink :to="`/crm/customers/${contract.customerId}`">{{ customerName }}</RouterLink>
        </n-descriptions-item>
        <n-descriptions-item label="签约门店">{{ storeName }}</n-descriptions-item>
        <n-descriptions-item label="金额">{{ toMajorUnits(contract.amount) }} 元</n-descriptions-item>
        <n-descriptions-item label="服务起止">{{ new Date(contract.startDate).toLocaleDateString() }} ~ {{ new Date(contract.endDate).toLocaleDateString() }}</n-descriptions-item>
        <n-descriptions-item label="签署时间">{{ contract.signedByCustomerAt ? new Date(contract.signedByCustomerAt).toLocaleString() : '未签署' }}</n-descriptions-item>
        <n-descriptions-item v-if="contract.status === 'VOIDED'" label="作废原因">{{ contract.voidReason }}</n-descriptions-item>
      </n-descriptions>

      <n-card size="small" title="合同正文" embedded style="margin-top: 12px; white-space: pre-wrap">{{ contract.content }}</n-card>

      <n-space style="margin-top: 16px">
        <template v-if="contract.status === 'DRAFT' && !contract.signedByCustomerAt">
          <n-button @click="openEdit">编辑</n-button>
          <n-button type="primary" @click="confirmSign">签署</n-button>
        </template>
        <n-button v-if="contract.status === 'DRAFT' && contract.signedByCustomerAt" type="primary" :loading="submitting" @click="handleSubmitReview">
          提交审核
        </n-button>
        <n-button v-if="contract.status === 'PENDING_APPROVAL'" @click="viewApprovalProgress">查看审批进度</n-button>
        <template v-if="contract.status === 'ACTIVE'">
          <n-button type="primary" @click="openRenew">续签</n-button>
          <n-button type="error" quaternary @click="voidVisible = true">作废</n-button>
        </template>
      </n-space>
    </n-card>

    <n-modal :show="editVisible" @update:show="(v) => (editVisible = v)">
      <n-card title="编辑合同" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="标题"><n-input v-model:value="editModel.title" /></n-form-item>
          <n-form-item label="正文"><n-input v-model:value="editModel.content" type="textarea" :autosize="{ minRows: 4 }" /></n-form-item>
          <n-form-item label="总金额（元）"><n-input-number v-model:value="editModel.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="服务起止日期"><n-date-picker v-model:value="editModel.dateRange" type="daterange" style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="editVisible = false">取消</n-button>
            <n-button type="primary" :loading="editSubmitting" @click="handleEditSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="renewVisible" @update:show="(v) => (renewVisible = v)">
      <n-card title="续签合同" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="新服务起止日期"><n-date-picker v-model:value="renewModel.dateRange" type="daterange" style="width: 100%" /></n-form-item>
          <n-form-item label="总金额（元）"><n-input-number v-model:value="renewModel.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="正文"><n-input v-model:value="renewModel.content" type="textarea" :autosize="{ minRows: 4 }" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="renewVisible = false">取消</n-button>
            <n-button type="primary" :loading="renewSubmitting" @click="handleRenew">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="voidVisible" @update:show="(v) => (voidVisible = v)">
      <n-card title="作废合同" style="width: 380px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="作废原因"><n-input v-model:value="voidReason" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="voidVisible = false">取消</n-button>
            <n-button type="error" :loading="voidSubmitting" @click="handleVoid">确认作废</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
