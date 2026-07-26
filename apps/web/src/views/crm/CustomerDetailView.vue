<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard,
  NSpace,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NDatePicker,
  type DataTableColumns,
} from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import { opportunityApi } from '../../api/modules/opportunity.api'
import { contractApi } from '../../api/modules/contract.api'
import { storeApi } from '../../api/modules/store.api'
import { contractTemplateApi } from '../../api/modules/contract-template.api'
import type { Customer } from '../../api/types/customer'
import type { SalesOpportunity } from '../../api/types/opportunity'
import type { Contract } from '../../api/types/contract'
import { renderStatusBadge, OPPORTUNITY_STAGE_MAP, CONTRACT_STATUS_MAP, CUSTOMER_SOURCE_LABEL_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'
import FollowUpTimeline from '../../components/crm/FollowUpTimeline.vue'

const route = useRoute()
const router = useRouter()
const customerId = route.params.id as string

const customer = ref<Customer | null>(null)
const opportunities = ref<SalesOpportunity[]>([])
const contracts = ref<Contract[]>([])
const loading = ref(false)

async function fetchAll() {
  loading.value = true
  try {
    const [c, opps, cons] = await Promise.all([
      customerApi.get(customerId),
      opportunityApi.list({ customerId }),
      contractApi.list({ customerId }),
    ])
    customer.value = c
    opportunities.value = opps
    contracts.value = cons
  } finally {
    loading.value = false
  }
}

// ---------------- 编辑客户 ----------------
const editVisible = ref(false)
const editModel = ref({ name: '', phone: '', remark: '' })
const editSubmitting = ref(false)

function openEdit() {
  if (!customer.value) return
  editModel.value = { name: customer.value.name, phone: customer.value.phone, remark: customer.value.remark ?? '' }
  editVisible.value = true
}

async function handleEditSubmit() {
  if (!customer.value) return
  editSubmitting.value = true
  try {
    customer.value = await customerApi.update(customer.value.id, { ...editModel.value, version: customer.value.version })
    message.success('客户信息已更新')
    editVisible.value = false
  } finally {
    editSubmitting.value = false
  }
}

// ---------------- 新建机会（customerId 锁定） ----------------
const oppVisible = ref(false)
const oppModel = ref({ amountYuan: null as number | null, remark: '' })
const oppSubmitting = ref(false)

function openCreateOpportunity() {
  oppModel.value = { amountYuan: null, remark: '' }
  oppVisible.value = true
}

async function handleCreateOpportunity() {
  oppSubmitting.value = true
  try {
    await opportunityApi.create({
      customerId,
      amount: toMinorUnits(oppModel.value.amountYuan ?? undefined),
      remark: oppModel.value.remark || undefined,
    })
    message.success('销售机会已创建')
    oppVisible.value = false
    await fetchAll()
  } finally {
    oppSubmitting.value = false
  }
}

// ---------------- 新建合同（customerId 锁定） ----------------
const contractVisible = ref(false)
const storeOptions = ref<{ label: string; value: string }[]>([])
const templateOptions = ref<{ label: string; value: string; content: string }[]>([])
const contractModel = ref({
  storeId: undefined as string | undefined,
  templateId: undefined as string | undefined,
  title: '',
  content: '',
  amountYuan: null as number | null,
  dateRange: null as [number, number] | null,
})
const contractSubmitting = ref(false)

async function openCreateContract() {
  const [stores, templates] = await Promise.all([storeApi.list(), contractTemplateApi.list()])
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  templateOptions.value = templates.map((t) => ({ label: t.name, value: t.id, content: t.content }))
  contractModel.value = {
    storeId: customer.value?.primaryStoreId ?? undefined,
    templateId: undefined,
    title: `${customer.value?.name ?? ''} 服务合同`,
    content: '',
    amountYuan: null,
    dateRange: null,
  }
  contractVisible.value = true
}

function handleTemplateChange(templateId: string | null) {
  const tpl = templateOptions.value.find((t) => t.value === templateId)
  if (tpl) contractModel.value.content = tpl.content
}

async function handleCreateContract() {
  const { storeId, title, content, amountYuan, dateRange } = contractModel.value
  if (!storeId || !title || !content || !amountYuan || !dateRange) {
    message.error('请完整填写门店/标题/正文/金额/起止日期')
    return
  }
  contractSubmitting.value = true
  try {
    const created = await contractApi.create({
      customerId,
      storeId,
      templateId: contractModel.value.templateId,
      title,
      content,
      amount: toMinorUnits(amountYuan)!,
      startDate: new Date(dateRange[0]).toISOString(),
      endDate: new Date(dateRange[1]).toISOString(),
    })
    message.success('合同已创建')
    contractVisible.value = false
    router.push(`/contract/records/${created.id}`)
  } finally {
    contractSubmitting.value = false
  }
}

const opportunityColumns: DataTableColumns<SalesOpportunity> = [
  { key: 'opportunityNo', title: '机会编号' },
  { key: 'stage', title: '阶段', render: (row) => renderStatusBadge(row.stage, OPPORTUNITY_STAGE_MAP) },
  { key: 'amount', title: '金额（元）', render: (row) => (toMajorUnits(row.amount) ?? '-').toString() },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/crm/opportunities/${row.id}`) }, { default: () => '查看' }),
  },
]

const contractColumns: DataTableColumns<Contract> = [
  { key: 'contractNo', title: '合同编号' },
  { key: 'title', title: '标题' },
  { key: 'amount', title: '金额（元）', render: (row) => toMajorUnits(row.amount) },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CONTRACT_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/contract/records/${row.id}`) }, { default: () => '查看' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div v-if="customer">
    <n-card :title="customer.name" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" @click="openEdit">编辑</n-button>
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="客户编号">{{ customer.customerNo }}</n-descriptions-item>
        <n-descriptions-item label="手机号">{{ customer.phone }}</n-descriptions-item>
        <n-descriptions-item label="来源">{{ CUSTOMER_SOURCE_LABEL_MAP[customer.source] ?? customer.source }}</n-descriptions-item>
        <n-descriptions-item label="备注">{{ customer.remark ?? '-' }}</n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="销售机会" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" type="primary" @click="openCreateOpportunity">新建机会</n-button>
      </template>
      <n-data-table :columns="opportunityColumns" :data="opportunities" :row-key="(r: SalesOpportunity) => r.id" />
    </n-card>

    <n-card title="合同" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" type="primary" @click="openCreateContract">新建合同</n-button>
      </template>
      <n-data-table :columns="contractColumns" :data="contracts" :row-key="(r: Contract) => r.id" />
    </n-card>

    <FollowUpTimeline business-type="CUSTOMER" :business-id="customerId" />

    <n-modal :show="editVisible" @update:show="(v) => (editVisible = v)">
      <n-card title="编辑客户" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="姓名"><n-input v-model:value="editModel.name" /></n-form-item>
          <n-form-item label="手机号"><n-input v-model:value="editModel.phone" /></n-form-item>
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

    <n-modal :show="oppVisible" @update:show="(v) => (oppVisible = v)">
      <n-card title="新建销售机会" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="意向金额（元）"><n-input-number v-model:value="oppModel.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="oppModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="oppVisible = false">取消</n-button>
            <n-button type="primary" :loading="oppSubmitting" @click="handleCreateOpportunity">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="contractVisible" @update:show="(v) => (contractVisible = v)">
      <n-card title="新建合同" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="签约门店"><n-select v-model:value="contractModel.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="合同模板">
            <n-select v-model:value="contractModel.templateId" :options="templateOptions" clearable @update:value="handleTemplateChange" />
          </n-form-item>
          <n-form-item label="标题"><n-input v-model:value="contractModel.title" /></n-form-item>
          <n-form-item label="正文"><n-input v-model:value="contractModel.content" type="textarea" :autosize="{ minRows: 4 }" /></n-form-item>
          <n-form-item label="总金额（元）"><n-input-number v-model:value="contractModel.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="服务起止日期"><n-date-picker v-model:value="contractModel.dateRange" type="daterange" style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="contractVisible = false">取消</n-button>
            <n-button type="primary" :loading="contractSubmitting" @click="handleCreateContract">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
