<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import { roomApi } from '../../api/modules/room.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import type { RoomOccupancy } from '../../api/types/room-occupancy'
import type { Room } from '../../api/types/room'
import { renderStatusBadge, ROOM_OCCUPANCY_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const rows = ref<RoomOccupancy[]>([])
const loading = ref(false)

const storeOptions = ref<{ label: string; value: string }[]>([])
const allRooms = ref<Room[]>([])
const roomOptionsByStore = ref<{ label: string; value: string }[]>([])
const roomNoById = ref<Record<string, string>>({})
const customerOptions = ref<{ label: string; value: string }[]>([])
const customerNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await roomOccupancyApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const [stores, rooms, customers] = await Promise.all([storeApi.list(), roomApi.list(), customerApi.list()])
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  allRooms.value = rooms
  roomNoById.value = Object.fromEntries(rooms.map((r) => [r.id, r.roomNo]))
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
  customerNameById.value = Object.fromEntries(customers.map((c) => [c.id, c.name]))
}

function onStoreChange(storeId: string | null) {
  model.value.roomId = null
  roomOptionsByStore.value = storeId ? allRooms.value.filter((r) => r.storeId === storeId).map((r) => ({ label: r.roomNo, value: r.id })) : []
}

// ---------------- 新建预订 ----------------
const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  roomId: null as string | null,
  customerId: null as string | null,
  dateRange: null as [number, number] | null,
})

function openCreateModal() {
  model.value = { storeId: null, roomId: null, customerId: null, dateRange: null }
  roomOptionsByStore.value = []
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.roomId || !model.value.customerId || !model.value.dateRange) {
    message.error('请完整填写门店/房间/客户/起止日期')
    return
  }
  submitting.value = true
  try {
    await roomOccupancyApi.create({
      roomId: model.value.roomId,
      storeId: model.value.storeId,
      customerId: model.value.customerId,
      plannedCheckIn: new Date(model.value.dateRange[0]).toISOString(),
      plannedCheckOut: new Date(model.value.dateRange[1]).toISOString(),
    })
    message.success('预订已创建')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 行内状态机操作 ----------------
function handleCheckIn(row: RoomOccupancy) {
  dialog.warning({
    title: '办理入住',
    content: `确认「${row.occupancyNo}」办理入住？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await roomOccupancyApi.checkIn(row.id, row.version)
      message.success('已办理入住')
      await fetchList()
    },
  })
}

function handleCheckOut(row: RoomOccupancy) {
  dialog.warning({
    title: '办理离店',
    content: `确认「${row.occupancyNo}」办理离店？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await roomOccupancyApi.checkOut(row.id, row.version)
      message.success('已办理离店')
      await fetchList()
    },
  })
}

const cancelVisible = ref(false)
const cancelTarget = ref<RoomOccupancy | null>(null)
const cancelReason = ref('')
const cancelSubmitting = ref(false)

function openCancelModal(row: RoomOccupancy) {
  cancelTarget.value = row
  cancelReason.value = ''
  cancelVisible.value = true
}

async function handleCancel() {
  if (!cancelTarget.value) return
  if (!cancelReason.value.trim()) {
    message.error('请填写取消原因')
    return
  }
  cancelSubmitting.value = true
  try {
    await roomOccupancyApi.cancel(cancelTarget.value.id, cancelReason.value, cancelTarget.value.version)
    message.success('预订已取消')
    cancelVisible.value = false
    await fetchList()
  } finally {
    cancelSubmitting.value = false
  }
}

const columns: DataTableColumns<RoomOccupancy> = [
  { key: 'occupancyNo', title: '占用编号' },
  { key: 'roomId', title: '房间号', render: (row) => roomNoById.value[row.roomId] ?? row.roomId },
  { key: 'customerId', title: '客户', render: (row) => customerNameById.value[row.customerId] ?? row.customerId },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, ROOM_OCCUPANCY_STATUS_MAP) },
  { key: 'plannedCheckIn', title: '计划入住', render: (row) => new Date(row.plannedCheckIn).toLocaleDateString() },
  { key: 'plannedCheckOut', title: '计划离店', render: (row) => new Date(row.plannedCheckOut).toLocaleDateString() },
  {
    key: 'actions',
    title: '操作',
    width: 200,
    render: (row) => {
      const buttons = []
      if (row.status === 'RESERVED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleCheckIn(row) }, { default: () => '入住' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => openCancelModal(row) }, { default: () => '取消' }))
      } else if (row.status === 'CHECKED_IN') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleCheckOut(row) }, { default: () => '离店' }))
      }
      return h(NSpace, {}, { default: () => buttons })
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
      <n-button type="primary" @click="openCreateModal">新建预订</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: RoomOccupancy) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建预订" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" @update:value="onStoreChange" /></n-form-item>
          <n-form-item label="房间"><n-select v-model:value="model.roomId" :options="roomOptionsByStore" /></n-form-item>
          <n-form-item label="客户"><n-select v-model:value="model.customerId" :options="customerOptions" filterable /></n-form-item>
          <n-form-item label="起止日期"><n-date-picker v-model:value="model.dateRange" type="daterange" style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="cancelVisible" @update:show="(v) => (cancelVisible = v)">
      <n-card title="取消预订" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="取消原因"><n-input v-model:value="cancelReason" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="cancelVisible = false">取消</n-button>
            <n-button type="error" :loading="cancelSubmitting" @click="handleCancel">确认取消</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
