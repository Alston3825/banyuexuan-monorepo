<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { vehicleBookingApi, vehicleApi } from '../../api/modules/logistics.api'
import { storeApi } from '../../api/modules/store.api'
import type { VehicleBooking, Vehicle } from '../../api/types/logistics'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, VEHICLE_BOOKING_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<VehicleBooking[]>([])
const stores = ref<Store[]>([])
const vehicles = ref<Vehicle[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const vehicleOptions = computed(() => vehicles.value.map((v) => ({ label: `${v.plateNumber}（${v.model}）`, value: v.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  vehicleId: null as string | null,
  storeId: null as string | null,
  purpose: '',
  timeRange: null as [number, number] | null,
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await vehicleBookingApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { vehicleId: vehicles.value[0]?.id ?? null, storeId: stores.value[0]?.id ?? null, purpose: '', timeRange: null }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.vehicleId || !model.value.storeId || !model.value.purpose || !model.value.timeRange) {
    message.error('请完整填写车辆、门店、用途与用车时段')
    return
  }
  submitting.value = true
  try {
    await vehicleBookingApi.create({
      vehicleId: model.value.vehicleId,
      storeId: model.value.storeId,
      purpose: model.value.purpose,
      startTime: new Date(model.value.timeRange[0]).toISOString(),
      endTime: new Date(model.value.timeRange[1]).toISOString(),
    })
    message.success('用车申请已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleCancel(row: VehicleBooking) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  vehicleBookingApi.cancel(row.id, reason, row.version).then(() => {
    message.success('用车申请已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<VehicleBooking> = [
  { key: 'vehicle', title: '车辆', render: (row) => `${row.vehicle.plateNumber}（${row.vehicle.model}）` },
  { key: 'store', title: '申请门店', render: (row) => stores.value.find((s) => s.id === row.storeId)?.name ?? row.storeId },
  { key: 'applicant', title: '申请人', render: (row) => row.applicant.realName },
  { key: 'purpose', title: '用途' },
  { key: 'time', title: '用车时段', render: (row) => `${new Date(row.startTime).toLocaleString()} ~ ${new Date(row.endTime).toLocaleString()}` },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, VEHICLE_BOOKING_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row): VNode | null => (row.status === 'BOOKED' ? h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }) : null),
  },
]

onMounted(async () => {
  const [storeList, vehicleList] = await Promise.all([storeApi.list(), vehicleApi.list()])
  stores.value = storeList
  vehicles.value = vehicleList
  await fetchAll()
})
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建用车申请</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: VehicleBooking) => r.id" :scroll-x="1100" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建用车申请" style="width: min(520px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="车辆"><n-select v-model:value="model.vehicleId" :options="vehicleOptions" filterable /></n-form-item>
          <n-form-item label="申请门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="用途"><n-input v-model:value="model.purpose" placeholder="如 接送客户/采购物资" /></n-form-item>
          <n-form-item label="用车时段"><n-date-picker v-model:value="model.timeRange" type="datetimerange" style="width: 100%" /></n-form-item>
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
