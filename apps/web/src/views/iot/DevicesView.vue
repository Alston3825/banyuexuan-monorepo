<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { deviceApi, deviceTypeApi } from '../../api/modules/iot.api'
import { storeApi } from '../../api/modules/store.api'
import { roomApi } from '../../api/modules/room.api'
import type { Device, DeviceType } from '../../api/types/iot'
import type { Store } from '../../api/types/store'
import type { Room } from '../../api/types/room'
import { renderStatusBadge, DEVICE_STATUS_MAP, DEVICE_CATEGORY_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<Device[]>([])
const stores = ref<Store[]>([])
const deviceTypes = ref<DeviceType[]>([])
const rooms = ref<Room[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const deviceTypeOptions = computed(() => deviceTypes.value.map((t) => ({ label: `${t.name}（${DEVICE_CATEGORY_LABEL_MAP[t.category] ?? t.category}）`, value: t.id })))
const roomOptions = computed(() => rooms.value.map((r) => ({ label: r.roomNo, value: r.id })))

const formVisible = ref(false)
const editingRow = ref<Device | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  storeId: null as string | null,
  deviceTypeId: null as string | null,
  code: '',
  name: '',
  roomId: null as string | null,
  status: 'OFFLINE' as Device['status'],
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await deviceApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchRoomsForStore(storeId: string | null) {
  rooms.value = storeId ? await roomApi.list({ storeId }) : []
}

watch(
  () => model.value.storeId,
  (storeId) => {
    if (formVisible.value) fetchRoomsForStore(storeId)
  },
)

function openCreateModal() {
  editingRow.value = null
  model.value = { storeId: stores.value[0]?.id ?? null, deviceTypeId: deviceTypes.value[0]?.id ?? null, code: '', name: '', roomId: null, status: 'OFFLINE' }
  fetchRoomsForStore(model.value.storeId)
  formVisible.value = true
}

function openEditModal(row: Device) {
  editingRow.value = row
  model.value = { storeId: row.storeId, deviceTypeId: row.deviceTypeId, code: row.code, name: row.name, roomId: row.roomId, status: row.status }
  fetchRoomsForStore(row.storeId)
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (!model.value.storeId || !model.value.deviceTypeId) {
    message.error('请选择门店与设备类型')
    return
  }
  submitting.value = true
  try {
    if (editingRow.value) {
      await deviceApi.update(editingRow.value.id, {
        name: model.value.name,
        roomId: model.value.roomId ?? undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('设备已更新')
    } else {
      await deviceApi.create({
        storeId: model.value.storeId,
        deviceTypeId: model.value.deviceTypeId,
        code: model.value.code,
        name: model.value.name,
        roomId: model.value.roomId ?? undefined,
      })
      message.success('设备已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function storeName(storeId: string) {
  return stores.value.find((s) => s.id === storeId)?.name ?? storeId
}
function deviceTypeName(deviceTypeId: string) {
  const t = deviceTypes.value.find((dt) => dt.id === deviceTypeId)
  return t ? `${t.name}（${DEVICE_CATEGORY_LABEL_MAP[t.category] ?? t.category}）` : deviceTypeId
}

const columns: DataTableColumns<Device> = [
  { key: 'code', title: '设备编号' },
  { key: 'name', title: '名称' },
  { key: 'deviceType', title: '设备类型', render: (row) => deviceTypeName(row.deviceTypeId) },
  { key: 'store', title: '所属门店', render: (row) => storeName(row.storeId) },
  { key: 'room', title: '绑定房间', render: (row) => rooms.value.find((r) => r.id === row.roomId)?.roomNo ?? (row.roomId ? row.roomId : '-') },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, DEVICE_STATUS_MAP) },
  { key: 'lastSeenAt', title: '最近上报时间', render: (row) => (row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '-') },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(async () => {
  const [storeList, deviceTypeList] = await Promise.all([storeApi.list(), deviceTypeApi.list()])
  stores.value = storeList
  deviceTypes.value = deviceTypeList
  // 预取全部门店的房间，供设备台账列表展示房间号
  const allRooms = await Promise.all(storeList.map((s) => roomApi.list({ storeId: s.id })))
  rooms.value = allRooms.flat()
  await fetchAll()
})
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建设备</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Device) => r.id" :scroll-x="1000" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑设备' : '新建设备'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="所属门店" path="storeId" :rule="{ required: true, message: '请选择门店' }">
            <n-select v-model:value="model.storeId" :options="storeOptions" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="设备类型" path="deviceTypeId" :rule="{ required: true, message: '请选择设备类型' }">
            <n-select v-model:value="model.deviceTypeId" :options="deviceTypeOptions" filterable />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="设备编号" path="code" :rule="{ required: true, message: '请输入设备编号' }">
            <n-input v-model:value="model.code" placeholder="如 CALL-301" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 301房呼叫器" />
          </n-form-item>
          <n-form-item label="绑定房间">
            <n-select v-model:value="model.roomId" :options="roomOptions" clearable placeholder="呼叫器/门禁等可绑定房间；总表等可不绑定" />
          </n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '在线', value: 'ONLINE' },
                { label: '离线', value: 'OFFLINE' },
                { label: '已停用', value: 'DISABLED' },
              ]"
            />
          </n-form-item>
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
