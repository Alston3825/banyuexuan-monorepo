<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NTag, NAlert, type DataTableColumns } from 'naive-ui'
import { roomApi } from '../../api/modules/room.api'
import { roomTypeApi } from '../../api/modules/room-type.api'
import { storeApi } from '../../api/modules/store.api'
import type { Room, RoomDeleteCheck } from '../../api/types/room'
import { useAuthStore } from '../../stores/auth'
import { message, dialog } from '../../utils/discrete-api'

const auth = useAuthStore()
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

// ---------------- 删除 ----------------
// 误删防护分三层（后端 RoomService.remove 会重新校验，前端只负责把话说清楚）：
// 1. 空房间（从没有预订/入住记录）：普通二次确认；
// 2. 有正式数据：没有管理员权限的账号只看到"需要管理员"的提示，没有删除按钮；
//    有管理员权限的账号要在红色弹窗里手输房间号才能点删除；
// 3. 有未结束的预订/入住，或历史记录下挂着母婴档案等业务数据：任何人都不能删。
const deleteVisible = ref(false)
const deleteTarget = ref<Room | null>(null)
const deleteCheck = ref<RoomDeleteCheck | null>(null)
const deleteConfirmText = ref('')
const deleteSubmitting = ref(false)
const deleteChecking = ref<string | null>(null)

async function openDeleteFlow(row: Room) {
  deleteChecking.value = row.id
  try {
    deleteCheck.value = await roomApi.deleteCheck(row.id)
  } finally {
    deleteChecking.value = null
  }
  deleteTarget.value = row
  deleteConfirmText.value = ''
  if (deleteCheck.value.hasData || deleteCheck.value.activeOccupancyCount > 0 || deleteCheck.value.blockers.length > 0) {
    deleteVisible.value = true
    return
  }
  dialog.warning({
    title: '删除房间',
    content: `确认删除房间「${row.roomNo}」（${row.floor}）吗？该房间没有任何预订/入住记录，删除后不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await roomApi.remove(row.id)
      message.success('房间已删除')
      await fetchList()
    },
  })
}

/** 弹窗里展示的状态：blocked=谁都不能删；needAdmin=没权限；confirm=可输入房间号后删除 */
const deleteMode = computed<'blocked' | 'needAdmin' | 'confirm'>(() => {
  const c = deleteCheck.value
  if (!c) return 'blocked'
  if (c.activeOccupancyCount > 0 || c.blockers.length > 0) return 'blocked'
  return c.canForceDelete ? 'confirm' : 'needAdmin'
})
const deleteConfirmMatched = computed(() => !!deleteTarget.value && deleteConfirmText.value.trim() === deleteTarget.value.roomNo)

async function handleConfirmDelete() {
  if (!deleteTarget.value || !deleteConfirmMatched.value) return
  deleteSubmitting.value = true
  try {
    await roomApi.remove(deleteTarget.value.id, deleteConfirmText.value.trim())
    message.success('房间已删除')
    deleteVisible.value = false
    await fetchList()
  } finally {
    deleteSubmitting.value = false
  }
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
    width: 320,
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
      if (auth.hasAccess('room.room.delete')) {
        buttons.push(
          h(
            NButton,
            { size: 'small', type: 'error', quaternary: true, loading: deleteChecking.value === row.id, onClick: () => openDeleteFlow(row) },
            { default: () => '删除' },
          ),
        )
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

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑房间' : '新建房间'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
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

    <n-modal :mask-closable="false" :show="maintenanceVisible" @update:show="(v) => (maintenanceVisible = v)">
      <n-card title="标记维修" style="width: min(420px, 94vw)" :bordered="false" role="dialog" closable @close="maintenanceVisible = false" aria-modal="true">
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

    <n-modal :mask-closable="false" :show="deleteVisible" @update:show="(v) => (deleteVisible = v)">
      <n-card
        :title="deleteMode === 'confirm' ? '⚠ 删除有数据的房间' : '无法删除房间'"
        style="width: min(480px, 94vw)"
        :bordered="false"
        role="dialog"
        closable
        @close="deleteVisible = false"
        aria-modal="true"
      >
        <template v-if="deleteCheck && deleteTarget">
          <n-alert v-if="deleteMode === 'blocked'" type="error" :show-icon="false" style="margin-bottom: 12px">
            <template v-if="deleteCheck.activeOccupancyCount > 0">
              房间「{{ deleteTarget.roomNo }}」还有 {{ deleteCheck.activeOccupancyCount }} 条未结束的预订/入住记录，请先到「预订记录」办理离店或取消预订，再回来删除。
            </template>
            <template v-else>
              房间「{{ deleteTarget.roomNo }}」的历史记录下关联了{{ deleteCheck.blockers.join('、') }}，删除会造成这些数据丢失，因此不允许删除。
              如果该房间不再使用，请改用「标记维修」停用。
            </template>
          </n-alert>

          <n-alert v-else-if="deleteMode === 'needAdmin'" type="warning" :show-icon="false" style="margin-bottom: 12px">
            房间「{{ deleteTarget.roomNo }}」已有 {{ deleteCheck.occupancyTotal }} 条预订/入住记录<template v-if="deleteCheck.deviceCount">、{{ deleteCheck.deviceCount }} 台绑定设备</template>，属于正式数据。
            删除这类房间需要<b>管理员权限</b>，你的账号没有该权限，请联系管理员处理。
          </n-alert>

          <template v-else>
            <n-alert type="error" :show-icon="false" style="margin-bottom: 12px">
              房间「{{ deleteTarget.roomNo }}」（{{ deleteTarget.floor }}）已有正式数据，删除后<b>无法恢复</b>：
              <ul style="margin: 6px 0 0; padding-left: 20px">
                <li v-if="deleteCheck.occupancyTotal">将同时删除该房间名下 {{ deleteCheck.occupancyTotal }} 条历史预订/入住记录（均已离店或已取消）</li>
                <li v-if="deleteCheck.deviceCount">该房间绑定的 {{ deleteCheck.deviceCount }} 台设备会自动解除绑定（设备本身保留）</li>
              </ul>
            </n-alert>
            <div style="margin-bottom: 6px">请输入房间号 <b>{{ deleteTarget.roomNo }}</b> 以确认删除：</div>
            <n-input v-model:value="deleteConfirmText" :placeholder="deleteTarget.roomNo" @keyup.enter="handleConfirmDelete" />
          </template>
        </template>
        <template #footer>
          <n-space justify="end">
            <n-button @click="deleteVisible = false">{{ deleteMode === 'confirm' ? '取消' : '我知道了' }}</n-button>
            <n-button v-if="deleteMode === 'confirm'" type="error" :disabled="!deleteConfirmMatched" :loading="deleteSubmitting" @click="handleConfirmDelete">
              确认删除
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
