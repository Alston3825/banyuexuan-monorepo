<script setup lang="ts">
import { computed, h, onMounted, ref, watch, type VNode } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { customerServicePackageApi, serviceAppointmentApi, serviceProductApi, therapistApi } from '../../api/modules/service.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import type { CustomerServicePackage, ServiceAppointment, ServiceProduct, Therapist } from '../../api/types/service'
import type { Customer } from '../../api/types/customer'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, SERVICE_APPOINTMENT_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const rows = ref<ServiceAppointment[]>([])
const customers = ref<Customer[]>([])
const products = ref<ServiceProduct[]>([])
const therapists = ref<Therapist[]>([])
const stores = ref<Store[]>([])
const customerPackages = ref<CustomerServicePackage[]>([])
const loading = ref(false)

const customerNameById = computed(() => new Map(customers.value.map((c) => [c.id, c.name])))
const customerOptions = computed(() => customers.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })))
const productOptions = computed(() => products.value.map((p) => ({ label: p.name, value: p.id })))
const therapistOptions = computed(() => therapists.value.map((t) => ({ label: t.name, value: t.id })))
const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const availablePackageOptions = computed(() =>
  customerPackages.value
    .filter((p) => p.customerId === model.value.customerId && p.status === 'ACTIVE')
    .map((p) => ({ label: `${p.package.name}（剩余${p.remainingSessions}次）`, value: p.id })),
)

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  customerId: null as string | null,
  productId: null as string | null,
  therapistId: null as string | null,
  sourcePackageId: null as string | null,
  scheduledAt: null as number | null,
  durationMinutes: 60,
})

async function fetchAll() {
  loading.value = true
  try {
    const [appointments, customerList, productList, therapistList, storeList, packageList] = await Promise.all([
      serviceAppointmentApi.list(),
      customerApi.list(),
      serviceProductApi.list(),
      therapistApi.list(),
      storeApi.list(),
      customerServicePackageApi.list(),
    ])
    rows.value = appointments
    customers.value = customerList
    products.value = productList
    therapists.value = therapistList
    stores.value = storeList
    customerPackages.value = packageList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = {
    storeId: stores.value[0]?.id ?? null,
    customerId: null,
    productId: null,
    therapistId: null,
    sourcePackageId: null,
    scheduledAt: Date.now(),
    durationMinutes: 60,
  }
  formVisible.value = true
}

function onProductChange(productId: string | null) {
  const product = products.value.find((p) => p.id === productId)
  if (product?.durationMinutes) model.value.durationMinutes = product.durationMinutes
}

watch(
  () => model.value.customerId,
  () => {
    model.value.sourcePackageId = null
  },
)

async function handleSubmit() {
  if (!model.value.storeId || !model.value.customerId || !model.value.productId || !model.value.scheduledAt) {
    message.error('请完整填写门店/客户/项目/预约时间')
    return
  }
  submitting.value = true
  try {
    await serviceAppointmentApi.create({
      storeId: model.value.storeId,
      customerId: model.value.customerId,
      productId: model.value.productId,
      therapistId: model.value.therapistId ?? undefined,
      sourcePackageId: model.value.sourcePackageId ?? undefined,
      scheduledAt: new Date(model.value.scheduledAt).toISOString(),
      durationMinutes: model.value.durationMinutes,
    })
    message.success('预约已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleComplete(row: ServiceAppointment) {
  dialog.warning({
    title: '完成预约',
    content: row.sourcePackageId ? '确认完成？将从客户服务包扣减1次。' : '确认完成该预约？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await serviceAppointmentApi.complete(row.id, row.version)
      message.success('预约已完成')
      await fetchAll()
    },
  })
}

async function handleCancel(row: ServiceAppointment, noShow: boolean) {
  const reason = window.prompt(noShow ? '爽约原因' : '取消原因')
  if (!reason) return
  await serviceAppointmentApi.cancel(row.id, reason, noShow, row.version)
  message.success(noShow ? '已标记爽约' : '预约已取消')
  await fetchAll()
}

// ---------------- 评价 ----------------
const feedbackVisible = ref(false)
const feedbackTarget = ref<ServiceAppointment | null>(null)
const feedbackRating = ref(5)
const feedbackComment = ref('')
const feedbackSubmitting = ref(false)

function openFeedback(row: ServiceAppointment) {
  feedbackTarget.value = row
  feedbackRating.value = row.rating ?? 5
  feedbackComment.value = row.comment ?? ''
  feedbackVisible.value = true
}

async function handleFeedback() {
  if (!feedbackTarget.value) return
  feedbackSubmitting.value = true
  try {
    await serviceAppointmentApi.feedback(feedbackTarget.value.id, feedbackRating.value, feedbackComment.value || undefined)
    message.success('评价已提交')
    feedbackVisible.value = false
    await fetchAll()
  } finally {
    feedbackSubmitting.value = false
  }
}

const columns: DataTableColumns<ServiceAppointment> = [
  { key: 'appointmentNo', title: '预约编号' },
  { key: 'customer', title: '客户', render: (row) => customerNameById.value.get(row.customerId) ?? row.customerId },
  { key: 'product', title: '项目', render: (row) => row.product.name },
  { key: 'therapist', title: '技师', render: (row) => row.therapist?.name ?? '-' },
  { key: 'scheduledAt', title: '预约时间', render: (row) => new Date(row.scheduledAt).toLocaleString() },
  { key: 'source', title: '来源', render: (row) => (row.sourcePackage ? `服务包：${row.sourcePackage.package.name}` : '散卖') },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, SERVICE_APPOINTMENT_STATUS_MAP) },
  { key: 'rating', title: '评价', render: (row) => (row.rating ? `${row.rating} 分` : '-') },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'BOOKED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleComplete(row) }, { default: () => '完成' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row, false) }, { default: () => '取消' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row, true) }, { default: () => '爽约' }))
      }
      if (row.status === 'COMPLETED') {
        buttons.push(h(NButton, { size: 'small', onClick: () => openFeedback(row) }, { default: () => (row.rating ? '修改评价' : '评价') }))
      }
      return h(NSpace, {}, { default: () => buttons })
    },
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建预约</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ServiceAppointment) => r.id" :scroll-x="1100" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建预约" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="客户"><n-select v-model:value="model.customerId" :options="customerOptions" filterable placeholder="搜索客户姓名/手机号" /></n-form-item>
          <n-form-item label="产康项目"><n-select v-model:value="model.productId" :options="productOptions" @update:value="onProductChange" /></n-form-item>
          <n-form-item label="技师"><n-select v-model:value="model.therapistId" :options="therapistOptions" clearable placeholder="可不选" /></n-form-item>
          <n-form-item label="来源服务包">
            <n-select v-model:value="model.sourcePackageId" :options="availablePackageOptions" clearable placeholder="不选=散卖，选择则从服务包扣减次数" />
          </n-form-item>
          <n-form-item label="预约时间"><n-date-picker v-model:value="model.scheduledAt" type="datetime" style="width: 100%" /></n-form-item>
          <n-form-item label="时长(分钟)"><n-input-number v-model:value="model.durationMinutes" :min="1" style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="feedbackVisible" @update:show="(v) => (feedbackVisible = v)">
      <n-card title="服务评价" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="评分"><n-input-number v-model:value="feedbackRating" :min="1" :max="5" style="width: 100%" /></n-form-item>
          <n-form-item label="评语"><n-input v-model:value="feedbackComment" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="feedbackVisible = false">取消</n-button>
            <n-button type="primary" :loading="feedbackSubmitting" @click="handleFeedback">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
