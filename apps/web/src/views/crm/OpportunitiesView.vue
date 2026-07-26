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
  NInputNumber,
  NSelect,
  NInput,
  type DataTableColumns,
} from 'naive-ui'
import { opportunityApi } from '../../api/modules/opportunity.api'
import { customerApi } from '../../api/modules/customer.api'
import type { SalesOpportunity } from '../../api/types/opportunity'
import { renderStatusBadge, OPPORTUNITY_STAGE_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<SalesOpportunity[]>([])
const loading = ref(false)

const customerOptions = ref<{ label: string; value: string }[]>([])
const customerNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await opportunityApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const customers = await customerApi.list()
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
  customerNameById.value = Object.fromEntries(customers.map((c) => [c.id, c.name]))
}

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({ customerId: undefined as string | undefined, amountYuan: null as number | null, remark: '' })

function openCreateModal() {
  model.value = { customerId: undefined, amountYuan: null, remark: '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.customerId) {
    message.error('请选择客户')
    return
  }
  submitting.value = true
  try {
    await opportunityApi.create({
      customerId: model.value.customerId,
      amount: toMinorUnits(model.value.amountYuan ?? undefined),
      remark: model.value.remark || undefined,
    })
    message.success('销售机会已创建')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<SalesOpportunity> = [
  { key: 'opportunityNo', title: '机会编号' },
  { key: 'customerId', title: '客户', render: (row) => customerNameById.value[row.customerId] ?? row.customerId },
  { key: 'stage', title: '阶段', render: (row) => renderStatusBadge(row.stage, OPPORTUNITY_STAGE_MAP) },
  { key: 'amount', title: '金额（元）', render: (row) => (toMajorUnits(row.amount) ?? '-').toString() },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/crm/opportunities/${row.id}`) }, { default: () => '查看详情' }),
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
      <n-button type="primary" @click="openCreateModal">新建机会</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: SalesOpportunity) => r.id" :scroll-x="760" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建销售机会" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="客户"><n-select v-model:value="model.customerId" :options="customerOptions" filterable /></n-form-item>
          <n-form-item label="意向金额（元）"><n-input-number v-model:value="model.amountYuan" style="width: 100%" /></n-form-item>
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
