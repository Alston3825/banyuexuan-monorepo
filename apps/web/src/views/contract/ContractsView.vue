<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { contractApi } from '../../api/modules/contract.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import { contractTemplateApi } from '../../api/modules/contract-template.api'
import type { Contract } from '../../api/types/contract'
import { renderStatusBadge, CONTRACT_STATUS_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<Contract[]>([])
const loading = ref(false)

const customerOptions = ref<{ label: string; value: string }[]>([])
const customerNameById = ref<Record<string, string>>({})
const storeOptions = ref<{ label: string; value: string }[]>([])
const storeNameById = ref<Record<string, string>>({})
const templateOptions = ref<{ label: string; value: string; content: string }[]>([])

async function fetchList() {
  loading.value = true
  try {
    rows.value = await contractApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const [customers, stores, templates] = await Promise.all([customerApi.list(), storeApi.list(), contractTemplateApi.list()])
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
  customerNameById.value = Object.fromEntries(customers.map((c) => [c.id, c.name]))
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
  templateOptions.value = templates.map((t) => ({ label: t.name, value: t.id, content: t.content }))
}

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  customerId: undefined as string | undefined,
  storeId: undefined as string | undefined,
  templateId: undefined as string | undefined,
  title: '',
  content: '',
  amountYuan: null as number | null,
  dateRange: null as [number, number] | null,
})

function openCreateModal() {
  model.value = { customerId: undefined, storeId: undefined, templateId: undefined, title: '', content: '', amountYuan: null, dateRange: null }
  formVisible.value = true
}

function handleTemplateChange(templateId: string | null) {
  const tpl = templateOptions.value.find((t) => t.value === templateId)
  if (tpl) model.value.content = tpl.content
}

async function handleSubmit() {
  const { customerId, storeId, title, content, amountYuan, dateRange } = model.value
  if (!customerId || !storeId || !title || !content || !amountYuan || !dateRange) {
    message.error('请完整填写客户/门店/标题/正文/金额/起止日期')
    return
  }
  submitting.value = true
  try {
    const created = await contractApi.create({
      customerId,
      storeId,
      templateId: model.value.templateId,
      title,
      content,
      amount: toMinorUnits(amountYuan)!,
      startDate: new Date(dateRange[0]).toISOString(),
      endDate: new Date(dateRange[1]).toISOString(),
    })
    message.success('合同已创建')
    formVisible.value = false
    router.push(`/contract/records/${created.id}`)
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<Contract> = [
  { key: 'contractNo', title: '合同编号' },
  { key: 'customerId', title: '客户', render: (row) => customerNameById.value[row.customerId] ?? row.customerId },
  { key: 'storeId', title: '门店', render: (row) => storeNameById.value[row.storeId] ?? row.storeId },
  { key: 'amount', title: '金额（元）', render: (row) => toMajorUnits(row.amount) },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CONTRACT_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/contract/records/${row.id}`) }, { default: () => '查看详情' }),
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
      <n-button type="primary" @click="openCreateModal">新建合同</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Contract) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建合同" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="客户"><n-select v-model:value="model.customerId" :options="customerOptions" filterable /></n-form-item>
          <n-form-item label="签约门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="合同模板">
            <n-select v-model:value="model.templateId" :options="templateOptions" clearable @update:value="handleTemplateChange" />
          </n-form-item>
          <n-form-item label="标题"><n-input v-model:value="model.title" /></n-form-item>
          <n-form-item label="正文"><n-input v-model:value="model.content" type="textarea" :autosize="{ minRows: 4 }" /></n-form-item>
          <n-form-item label="总金额（元）"><n-input-number v-model:value="model.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="服务起止日期"><n-date-picker v-model:value="model.dateRange" type="daterange" style="width: 100%" /></n-form-item>
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
