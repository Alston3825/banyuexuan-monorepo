<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, type DataTableColumns } from 'naive-ui'
import { customerServicePackageApi, servicePackageApi } from '../../api/modules/service.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import type { CustomerServicePackage, ServicePackage } from '../../api/types/service'
import type { Customer } from '../../api/types/customer'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, CUSTOMER_SERVICE_PACKAGE_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<CustomerServicePackage[]>([])
const customers = ref<Customer[]>([])
const packages = ref<ServicePackage[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const customerNameById = computed(() => new Map(customers.value.map((c) => [c.id, c.name])))
const customerOptions = computed(() => customers.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })))
const packageOptions = computed(() => packages.value.map((p) => ({ label: `${p.name}（${p.totalSessions}次/${(p.price / 100).toFixed(2)}元）`, value: p.id })))
const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  customerId: null as string | null,
  packageId: null as string | null,
  amount: 0,
})

async function fetchAll() {
  loading.value = true
  try {
    const [list, customerList, packageList, storeList] = await Promise.all([
      customerServicePackageApi.list(),
      customerApi.list(),
      servicePackageApi.list(),
      storeApi.list(),
    ])
    rows.value = list
    customers.value = customerList
    packages.value = packageList
    stores.value = storeList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, customerId: null, packageId: null, amount: 0 }
  formVisible.value = true
}

function onPackageChange(packageId: string | null) {
  const pkg = packages.value.find((p) => p.id === packageId)
  model.value.amount = pkg?.price ?? 0
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.customerId || !model.value.packageId) {
    message.error('请完整填写门店/客户/服务包')
    return
  }
  submitting.value = true
  try {
    await customerServicePackageApi.create({
      storeId: model.value.storeId,
      customerId: model.value.customerId,
      packageId: model.value.packageId,
      amount: model.value.amount,
    })
    message.success('服务包购买已登记')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<CustomerServicePackage> = [
  { key: 'customer', title: '客户', render: (row) => customerNameById.value.get(row.customerId) ?? row.customerId },
  { key: 'package', title: '服务包', render: (row) => row.package.name },
  { key: 'remainingSessions', title: '剩余次数', render: (row) => `${row.remainingSessions}/${row.package.totalSessions}` },
  { key: 'amount', title: '成交金额(分)', render: (row) => row.amount },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CUSTOMER_SERVICE_PACKAGE_STATUS_MAP) },
  { key: 'purchasedAt', title: '购买时间', render: (row) => new Date(row.purchasedAt).toLocaleString() },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">登记服务包购买</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: CustomerServicePackage) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="登记服务包购买" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="客户"><n-select v-model:value="model.customerId" :options="customerOptions" filterable placeholder="搜索客户姓名/手机号" /></n-form-item>
          <n-form-item label="服务包"><n-select v-model:value="model.packageId" :options="packageOptions" @update:value="onPackageChange" /></n-form-item>
          <n-form-item label="成交金额(分)"><n-input-number v-model:value="model.amount" :min="0" style="width: 100%" /></n-form-item>
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
