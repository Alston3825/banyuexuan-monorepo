<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import {
  NButton,
  NSpace,
  NDataTable,
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NDatePicker,
  NTabs,
  NTabPane,
  NEmpty,
  type DataTableColumns,
} from 'naive-ui'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import CheckInDialog from '../../components/room/CheckInDialog.vue'
import { roomApi } from '../../api/modules/room.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import { roomCallApi, roomOutingApi, roomServiceRequisitionApi } from '../../api/modules/room-ops.api'
import type { RoomOccupancy } from '../../api/types/room-occupancy'
import type { Room } from '../../api/types/room'
import type { RoomCall, RoomOuting, RoomServiceRequisition } from '../../api/types/room-ops'
import { renderStatusBadge, ROOM_OCCUPANCY_STATUS_MAP, ROOM_CALL_STATUS_MAP, ROOM_OUTING_STATUS_MAP, ROOM_REQUISITION_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const rows = ref<RoomOccupancy[]>([])
const loading = ref(false)

const storeOptions = ref<{ label: string; value: string }[]>([])
const allRooms = ref<Room[]>([])
const roomOptionsByStore = ref<{ label: string; value: string }[]>([])
const roomNoById = ref<Record<string, string>>({})
const customerOptions = ref<{ label: string; value: string }[]>([])
const customerNameById = ref<Record<string, string>>({})

// 搜索 + 状态筛选（纯前端过滤：一个门店全部预订量级在几千条以内，接口一次拉全量够用）
const keyword = ref('')
const statusFilter = ref<string | null>(null)
const statusOptions = Object.entries(ROOM_OCCUPANCY_STATUS_MAP).map(([value, meta]) => ({ label: meta.label, value }))
const filteredRows = computed(() => {
  const kw = keyword.value.trim()
  return rows.value.filter(
    (r) =>
      (!statusFilter.value || r.status === statusFilter.value) &&
      (!kw ||
        (customerNameById.value[r.customerId] ?? '').includes(kw) ||
        (roomNoById.value[r.roomId] ?? '').includes(kw) ||
        r.occupancyNo.includes(kw)),
  )
})

async function fetchList() {
  loading.value = true
  try {
    // 按入住日期倒序（最近的排最前）：数据量上千条以后，接口默认的"创建时间倒序"对前台没意义
    rows.value = (await roomOccupancyApi.list()).sort((a, b) => b.plannedCheckIn.localeCompare(a.plannedCheckIn))
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
    const created = await roomOccupancyApi.create({
      roomId: model.value.roomId,
      storeId: model.value.storeId,
      customerId: model.value.customerId,
      plannedCheckIn: new Date(model.value.dateRange[0]).toISOString(),
      plannedCheckOut: new Date(model.value.dateRange[1]).toISOString(),
    })
    message.success('预订已创建')
    if (created.conflicts?.length) message.warning(`注意：和 ${created.conflicts.map((c) => c.customerName).join('、')} 的预订日期重叠（或间隔不够整理房间），已加入“预订冲突”待协调清单`, { duration: 8000, closable: true })
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 行内状态机操作 ----------------
const checkInShow = ref(false)
const checkInId = ref<string | null>(null)
const checkInName = ref<string | null>(null)
function handleCheckIn(row: RoomOccupancy) {
  checkInId.value = row.id
  checkInName.value = customerNameById.value[row.customerId] ?? null
  checkInShow.value = true
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

// ---------------- 客房动态：呼叫/外出/客房服务领用 ----------------
const opsVisible = ref(false)
const opsOccupancy = ref<RoomOccupancy | null>(null)
const opsLoading = ref(false)
const calls = ref<RoomCall[]>([])
const outings = ref<RoomOuting[]>([])
const requisitions = ref<RoomServiceRequisition[]>([])

async function openOps(row: RoomOccupancy) {
  opsOccupancy.value = row
  opsVisible.value = true
  await fetchOps()
}

async function fetchOps() {
  if (!opsOccupancy.value) return
  opsLoading.value = true
  try {
    const occupancyId = opsOccupancy.value.id
    const [callList, outingList, requisitionList] = await Promise.all([
      roomCallApi.list({ occupancyId }),
      roomOutingApi.list({ occupancyId }),
      roomServiceRequisitionApi.list({ occupancyId }),
    ])
    calls.value = callList
    outings.value = outingList
    requisitions.value = requisitionList
  } finally {
    opsLoading.value = false
  }
}

// 呼叫记录
const callReason = ref('')
async function submitCall() {
  if (!callReason.value.trim() || !opsOccupancy.value) return
  await roomCallApi.create({ occupancyId: opsOccupancy.value.id, reason: callReason.value })
  callReason.value = ''
  message.success('呼叫记录已创建')
  await fetchOps()
}
async function handleCallDone(row: RoomCall) {
  await roomCallApi.handle(row.id)
  message.success('已处理')
  await fetchOps()
}
const callColumns: DataTableColumns<RoomCall> = [
  { key: 'reason', title: '呼叫事由' },
  { key: 'calledAt', title: '呼叫时间', render: (row) => new Date(row.calledAt).toLocaleString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, ROOM_CALL_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 90,
    render: (row) => (row.status === 'PENDING' ? h(NButton, { size: 'small', type: 'primary', onClick: () => handleCallDone(row) }, { default: () => '处理' }) : null),
  },
]

// 外出管理
const outingRange = ref<[number, number] | null>(null)
const outingRiskNote = ref('')
async function submitOuting() {
  if (!outingRange.value || !opsOccupancy.value) {
    message.error('请选择外出起止时间')
    return
  }
  await roomOutingApi.create({
    occupancyId: opsOccupancy.value.id,
    plannedOutAt: new Date(outingRange.value[0]).toISOString(),
    plannedBackAt: new Date(outingRange.value[1]).toISOString(),
    riskNote: outingRiskNote.value || undefined,
  })
  outingRange.value = null
  outingRiskNote.value = ''
  message.success('外出记录已创建')
  await fetchOps()
}
async function checkOutOuting(row: RoomOuting) {
  await roomOutingApi.checkOut(row.id, row.version)
  message.success('已签出')
  await fetchOps()
}
async function checkBackOuting(row: RoomOuting) {
  await roomOutingApi.checkBack(row.id, row.version)
  message.success('已签回')
  await fetchOps()
}
async function cancelOuting(row: RoomOuting) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  await roomOutingApi.cancel(row.id, reason, row.version)
  message.success('已取消')
  await fetchOps()
}
const outingColumns: DataTableColumns<RoomOuting> = [
  { key: 'plannedOutAt', title: '计划外出', render: (row) => new Date(row.plannedOutAt).toLocaleString() },
  { key: 'plannedBackAt', title: '计划返回', render: (row) => new Date(row.plannedBackAt).toLocaleString() },
  { key: 'riskNote', title: '风险提示', render: (row) => row.riskNote ?? '-' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, ROOM_OUTING_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 160,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'PLANNED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => checkOutOuting(row) }, { default: () => '签出' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => cancelOuting(row) }, { default: () => '取消' }))
      } else if (row.status === 'OUT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => checkBackOuting(row) }, { default: () => '签回' }))
      }
      return h(NSpace, {}, { default: () => buttons })
    },
  },
]

// 客房服务领用
const requisitionItemName = ref('')
const requisitionQuantity = ref(1)
async function submitRequisition() {
  if (!requisitionItemName.value.trim() || !opsOccupancy.value) {
    message.error('请填写领用物品')
    return
  }
  await roomServiceRequisitionApi.create({
    occupancyId: opsOccupancy.value.id,
    itemName: requisitionItemName.value,
    quantity: requisitionQuantity.value,
  })
  requisitionItemName.value = ''
  requisitionQuantity.value = 1
  message.success('领用记录已创建')
  await fetchOps()
}
async function fulfillRequisition(row: RoomServiceRequisition) {
  await roomServiceRequisitionApi.fulfill(row.id)
  message.success('已完成领用')
  await fetchOps()
}
const requisitionColumns: DataTableColumns<RoomServiceRequisition> = [
  { key: 'itemName', title: '物品' },
  { key: 'quantity', title: '数量' },
  { key: 'requestedAt', title: '申请时间', render: (row) => new Date(row.requestedAt).toLocaleString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, ROOM_REQUISITION_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 90,
    render: (row) => (row.status === 'REQUESTED' ? h(NButton, { size: 'small', type: 'primary', onClick: () => fulfillRequisition(row) }, { default: () => '完成' }) : null),
  },
]

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
    width: 280,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'RESERVED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleCheckIn(row) }, { default: () => '入住' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => openCancelModal(row) }, { default: () => '取消' }))
      } else if (row.status === 'CHECKED_IN') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleCheckOut(row) }, { default: () => '离店' }))
      }
      buttons.push(h(NButton, { size: 'small', onClick: () => openOps(row) }, { default: () => '客房动态' }))
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
      <n-space>
        <n-input v-model:value="keyword" placeholder="搜索客户姓名/房号/占用编号" clearable style="width: min(260px, 94vw)" />
        <n-select v-model:value="statusFilter" :options="statusOptions" placeholder="全部状态" clearable style="width: min(140px, 94vw)" />
      </n-space>
      <n-button type="primary" @click="openCreateModal">新建预订</n-button>
    </n-space>
    <n-data-table
      :columns="columns"
      :data="filteredRows"
      :loading="loading"
      :row-key="(r: RoomOccupancy) => r.id"
      :pagination="{ pageSize: 20, showSizePicker: true, pageSizes: [20, 50, 100] }"
      :scroll-x="900"
    />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建预订" style="width: min(480px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
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

    <n-modal :mask-closable="false" :show="cancelVisible" @update:show="(v) => (cancelVisible = v)">
      <n-card title="取消预订" style="width: min(420px, 94vw)" :bordered="false" role="dialog" closable @close="cancelVisible = false" aria-modal="true">
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

    <n-modal :mask-closable="false" :show="opsVisible" @update:show="(v) => (opsVisible = v)">
      <n-card
        v-if="opsOccupancy"
        :title="`客房动态：${opsOccupancy.occupancyNo}`"
        style="width: min(720px, 94vw)"
        :bordered="false"
        role="dialog"
        closable
        @close="opsVisible = false"
        aria-modal="true"
      >
        <n-tabs type="line" default-value="call">
          <n-tab-pane name="call" tab="呼叫记录">
            <n-space style="margin-bottom: 12px">
              <n-input v-model:value="callReason" placeholder="呼叫事由，如：需要热水" style="width: min(320px, 94vw)" />
              <n-button type="primary" @click="submitCall">发起呼叫</n-button>
            </n-space>
            <n-empty v-if="calls.length === 0" description="暂无呼叫记录" />
            <n-data-table v-else :columns="callColumns" :data="calls" :loading="opsLoading" :row-key="(r: RoomCall) => r.id" />
          </n-tab-pane>
          <n-tab-pane name="outing" tab="外出管理">
            <n-space style="margin-bottom: 12px">
              <n-date-picker v-model:value="outingRange" type="datetimerange" style="width: min(360px, 94vw)" />
              <n-input v-model:value="outingRiskNote" placeholder="风险提示（可选）" style="width: min(160px, 94vw)" />
              <n-button type="primary" @click="submitOuting">登记外出计划</n-button>
            </n-space>
            <n-empty v-if="outings.length === 0" description="暂无外出记录" />
            <n-data-table v-else :columns="outingColumns" :data="outings" :loading="opsLoading" :row-key="(r: RoomOuting) => r.id" />
          </n-tab-pane>
          <n-tab-pane name="requisition" tab="客房服务领用">
            <n-space style="margin-bottom: 12px">
              <n-input v-model:value="requisitionItemName" placeholder="领用物品，如：婴儿纸尿裤" style="width: min(220px, 94vw)" />
              <n-input-number v-model:value="requisitionQuantity" :min="1" style="width: min(100px, 94vw)" />
              <n-button type="primary" @click="submitRequisition">提交领用</n-button>
            </n-space>
            <n-empty v-if="requisitions.length === 0" description="暂无领用记录" />
            <n-data-table v-else :columns="requisitionColumns" :data="requisitions" :loading="opsLoading" :row-key="(r: RoomServiceRequisition) => r.id" />
          </n-tab-pane>
        </n-tabs>
        <template #footer>
          <n-space justify="end">
            <n-button @click="opsVisible = false">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
    <CheckInDialog v-model:show="checkInShow" :occupancy-id="checkInId" :customer-name="checkInName" @done="fetchList" />
  </div>
</template>
