<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NTag, type DataTableColumns } from 'naive-ui'
import { roomApi } from '../../api/modules/room.api'
import { roomTypeApi } from '../../api/modules/room-type.api'
import { storeApi } from '../../api/modules/store.api'
import type { Room } from '../../api/types/room'
import { message, dialog } from '../../utils/discrete-api'

const rows = ref<Room[]>([])
const loading = ref(false)

const roomTypeOptions = ref<{ label: string; value: string }[]>([])
const storeOptions = ref<{ label: string; value: string }[]>([])
const storeNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await roomApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const [roomTypes, stores] = await Promise.all([roomTypeApi.list(), storeApi.list()])
  roomTypeOptions.value = roomTypes.map((t) => ({ label: t.name, value: t.id }))
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
}

// ---------------- 新建/编辑 ----------------
const formVisible = ref(false)
const editingRow = ref<Room | null>(null)
const submitting = ref(false)
const model = ref({ storeId: '', roomTypeId: '', roomNo: '', floor: '' })

function openCreateModal() {
  editingRow.value = null
  model.value = { storeId: '', roomTypeId: '', roomNo: '', floor: '' }
  formVisible.value = true
}

function openEditModal(row: Room) {
  editingRow.value = row
  model.value = { storeId: row.storeId, roomTypeId: row.roomTypeId, roomNo: row.roomNo, floor: row.floor }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.roomTypeId || !model.value.roomNo || !model.value.floor) {
    message.error('请完整填写门店/房型/房间号/楼层')
    return
  }
  submitting.value = true
  try {
    if (editingRow.value) {
      await roomApi.update(editingRow.value.id, {
        roomTypeId: model.value.roomTypeId,
        roomNo: model.value.roomNo,
        floor: model.value.floor,
        version: editingRow.value.version,
      })
      message.success('房间已更新')
    } else {
      await roomApi.create({
        storeId: model.value.storeId,
        roomTypeId: model.value.roomTypeId,
        roomNo: model.value.roomNo,
        floor: model.value.floor,
      })
      message.success('房间已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 维修/清扫 ----------------
const maintenanceVisible = ref(false)
const maintenanceTarget = ref<Room | null>(null)
const maintenanceNote = ref('')
const maintenanceSubmitting = ref(false)

function openMaintenanceModal(row: Room) {
  maintenanceTarget.value = row
  maintenanceNote.value = ''
  maintenanceVisible.value = true
}

async function handleSetMaintenance() {
  if (!maintenanceTarget.value) return
  maintenanceSubmitting.value = true
  try {
    await roomApi.setMaintenance(maintenanceTarget.value.id, true, maintenanceNote.value || undefined, maintenanceTarget.value.version)
    message.success('已置为维修中')
    maintenanceVisible.value = false
    await fetchList()
  } finally {
    maintenanceSubmitting.value = false
  }
}

function handleClearMaintenance(row: Room) {
  dialog.warning({
    title: '解除维修',
    content: `确认「${row.roomNo}」已完成维修，恢复正常使用？`,
    positiveText: '确认解除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await roomApi.setMaintenance(row.id, false, undefined, row.version)
      message.success('已解除维修标志')
      await fetchList()
    },
  })
}

function handleMarkCleaned(row: Room) {
  dialog.warning({
    title: '完成清扫',
    content: `确认「${row.roomNo}」已完成清扫？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await roomApi.markCleaned(row.id, row.version)
      message.success('已完成清扫')
      await fetchList()
    },
  })
}

const columns: DataTableColumns<Room> = [
  { key: 'roomNo', title: '房间号' },
  { key: 'floor', title: '楼层' },
  { key: 'roomType', title: '房型', render: (row) => row.roomType?.name ?? row.roomTypeId },
  { key: 'storeId', title: '门店', render: (row) => storeNameById.value[row.storeId] ?? row.storeId },
  {
    key: 'underMaintenance',
    title: '维修状态',
    render: (row) => (row.underMaintenance ? h(NTag, { type: 'error', round: true, size: 'small' }, { default: () => '维修中' }) : h(NTag, { round: true, size: 'small' }, { default: () => '正常' })),
  },
  {
    key: 'needsCleaning',
    title: '清扫状态',
    render: (row) => (row.needsCleaning ? h(NTag, { type: 'warning', round: true, size: 'small' }, { default: () => '待清扫' }) : h(NTag, { type: 'success', round: true, size: 'small' }, { default: () => '已清洁' })),
  },
  {
    key: 'actions',
    title: '操作',
    width: 260,
    render: (row) => {
      const buttons = [h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' })]
      if (row.underMaintenance) {
        buttons.push(h(NButton, { size: 'small', onClick: () => handleClearMaintenance(row) }, { default: () => '解除维修' }))
      } else {
        buttons.push(h(NButton, { size: 'small', onClick: () => openMaintenanceModal(row) }, { default: () => '标记维修' }))
      }
      if (row.needsCleaning) {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleMarkCleaned(row) }, { default: () => '完成清扫' }))
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
      <n-button type="primary" @click="openCreateModal">新建房间</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Room) => r.id" :scroll-x="1000" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑房间' : '新建房间'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="门店">
            <n-select v-model:value="model.storeId" :options="storeOptions" :disabled="!!editingRow" />
          </n-form-item>
          <n-form-item label="房型"><n-select v-model:value="model.roomTypeId" :options="roomTypeOptions" /></n-form-item>
          <n-form-item label="房间号"><n-input v-model:value="model.roomNo" /></n-form-item>
          <n-form-item label="楼层"><n-input v-model:value="model.floor" placeholder='如 "1F"/"B1"' /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="maintenanceVisible" @update:show="(v) => (maintenanceVisible = v)">
      <n-card title="标记维修" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="维修备注"><n-input v-model:value="maintenanceNote" type="textarea" :autosize="{ minRows: 3 }" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="maintenanceVisible = false">取消</n-button>
            <n-button type="primary" :loading="maintenanceSubmitting" @click="handleSetMaintenance">确认</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
