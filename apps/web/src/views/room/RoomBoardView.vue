<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSpace, NSelect, NDatePicker, NCard, NGrid, NGi, NModal, NForm, NFormItem, NInput, NButton, NDescriptions, NDescriptionsItem, NEmpty } from 'naive-ui'
import { roomApi } from '../../api/modules/room.api'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import type { RoomBoardEntry, ComputedRoomStatus } from '../../api/types/room'
import { CARE_MODE_LABEL, ORIENTATION_LABEL } from '../../api/types/contract'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const storeOptions = ref<{ label: string; value: string }[]>([])
const selectedStoreId = ref<string | null>(null)
const selectedDate = ref<number>(Date.now())

const boardEntries = ref<RoomBoardEntry[]>([])
const loading = ref(false)

const CARE_LEVEL_SHORT: Record<string, string> = { LEVEL1: '一级', LEVEL2: '二级', LEVEL3: '三级' }
const customerOptions = ref<{ label: string; value: string }[]>([])

const statusColor: Record<ComputedRoomStatus, string> = {
  VACANT: '#e8f8f0',
  RESERVED: '#e6f3ff',
  OCCUPIED: '#fff4e0',
  PENDING_CLEANING: '#fdeaea',
  MAINTENANCE: '#efefef',
}
const statusLabel: Record<ComputedRoomStatus, string> = {
  VACANT: '空闲',
  RESERVED: '预订中',
  OCCUPIED: '使用中',
  PENDING_CLEANING: '待清扫',
  MAINTENANCE: '维修中',
}

// 卡片右上角的状态小标签配色（卡片底色仍按 statusColor，标签用同色系更深一档）
const statusPill: Record<ComputedRoomStatus, { background: string; color: string }> = {
  VACANT: { background: '#b9e9d0', color: '#085041' },
  RESERVED: { background: '#bcdcf7', color: '#0c447c' },
  OCCUPIED: { background: '#f6d9a0', color: '#633806' },
  PENDING_CLEANING: { background: '#f7c1c1', color: '#791f1f' },
  MAINTENANCE: { background: '#d3d1c7', color: '#444441' },
}

const groupedByFloor = computed(() => {
  const groups = new Map<string, RoomBoardEntry[]>()
  for (const entry of boardEntries.value) {
    const list = groups.get(entry.room.floor) ?? []
    list.push(entry)
    groups.set(entry.room.floor, list)
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})

function formatDay(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 卡片上入住/离店日期用 月-日，省宽度；预产期用完整年月日 */
function formatMonthDay(iso: string | null): string {
  return iso ? formatDay(iso).slice(5) : '-'
}

/** 预产期是今天或未来 6 天内（距今 0~6 天，即"不足7天"）→ 整行变红提醒。已过预产期的不提醒。 */
function isDueSoon(iso: string | null): boolean {
  if (!iso) return false
  const due = new Date(iso)
  const today = new Date()
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diffDays = Math.round((dueDay - todayDay) / 86400000)
  return diffDays >= 0 && diffDays < 7
}

/** 套餐：朝向 + 入住天数（N+N 只显示第一个 N，房态只关心所内入住天数） */
function packageText(entry: RoomBoardEntry): string {
  const c = entry.contract
  if (!c || (!c.orientation && !c.inHouseDays)) return '-'
  return [c.orientation ? ORIENTATION_LABEL[c.orientation] : '', c.inHouseDays ? `${c.inHouseDays}天` : ''].filter(Boolean).join(' · ')
}

// 卡片本身点击是打开操作弹窗，客户姓名的点击要单独跳转到客户详情，所以这里不能冒泡。
function openCustomer(entry: RoomBoardEntry) {
  if (entry.customerId) router.push(`/crm/customers/${entry.customerId}`)
}

async function fetchStores() {
  const stores = await storeApi.list()
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  if (stores.length > 0) selectedStoreId.value = stores[0].id
}

async function fetchCustomerOptions() {
  const customers = await customerApi.list()
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
}

async function fetchBoard() {
  if (!selectedStoreId.value) return
  loading.value = true
  try {
    boardEntries.value = await roomApi.board({
      storeId: selectedStoreId.value,
      date: new Date(selectedDate.value).toISOString(),
    })
  } finally {
    loading.value = false
  }
}

// ---------------- 卡片操作弹窗 ----------------
const actionVisible = ref(false)
const selectedEntry = ref<RoomBoardEntry | null>(null)

function openAction(entry: RoomBoardEntry) {
  selectedEntry.value = entry
  reserveModel.value = { customerId: null, dateRange: null }
  maintenanceNote.value = ''
  cancelReason.value = ''
  actionVisible.value = true
}

// 新建预订
const reserveModel = ref<{ customerId: string | null; dateRange: [number, number] | null }>({ customerId: null, dateRange: null })
const reserveSubmitting = ref(false)
async function handleReserve() {
  if (!selectedEntry.value || !reserveModel.value.customerId || !reserveModel.value.dateRange) {
    message.error('请选择客户和起止日期')
    return
  }
  reserveSubmitting.value = true
  try {
    await roomOccupancyApi.create({
      roomId: selectedEntry.value.room.id,
      storeId: selectedEntry.value.room.storeId,
      customerId: reserveModel.value.customerId,
      plannedCheckIn: new Date(reserveModel.value.dateRange[0]).toISOString(),
      plannedCheckOut: new Date(reserveModel.value.dateRange[1]).toISOString(),
    })
    message.success('预订已创建')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    reserveSubmitting.value = false
  }
}

// 标记维修
const maintenanceNote = ref('')
const maintenanceSubmitting = ref(false)
async function handleMaintenance() {
  if (!selectedEntry.value) return
  maintenanceSubmitting.value = true
  try {
    await roomApi.setMaintenance(selectedEntry.value.room.id, true, maintenanceNote.value || undefined, selectedEntry.value.room.version)
    message.success('已置为维修中')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    maintenanceSubmitting.value = false
  }
}

// 解除维修
const clearMaintenanceSubmitting = ref(false)
async function handleClearMaintenance() {
  if (!selectedEntry.value) return
  clearMaintenanceSubmitting.value = true
  try {
    await roomApi.setMaintenance(selectedEntry.value.room.id, false, undefined, selectedEntry.value.room.version)
    message.success('已解除维修标志')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    clearMaintenanceSubmitting.value = false
  }
}

// 办理入住
const checkInSubmitting = ref(false)
async function handleCheckIn() {
  if (!selectedEntry.value?.occupancyId) return
  checkInSubmitting.value = true
  try {
    const occ = await roomOccupancyApi.get(selectedEntry.value.occupancyId)
    await roomOccupancyApi.checkIn(selectedEntry.value.occupancyId, occ.version)
    message.success('已办理入住')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    checkInSubmitting.value = false
  }
}

// 取消预订
const cancelReason = ref('')
const cancelSubmitting = ref(false)
async function handleCancel() {
  if (!selectedEntry.value?.occupancyId) return
  if (!cancelReason.value.trim()) {
    message.error('请填写取消原因')
    return
  }
  cancelSubmitting.value = true
  try {
    const occ = await roomOccupancyApi.get(selectedEntry.value.occupancyId)
    await roomOccupancyApi.cancel(selectedEntry.value.occupancyId, cancelReason.value, occ.version)
    message.success('预订已取消')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    cancelSubmitting.value = false
  }
}

// 办理离店
const checkOutSubmitting = ref(false)
async function handleCheckOut() {
  if (!selectedEntry.value?.occupancyId) return
  checkOutSubmitting.value = true
  try {
    const occ = await roomOccupancyApi.get(selectedEntry.value.occupancyId)
    await roomOccupancyApi.checkOut(selectedEntry.value.occupancyId, occ.version)
    message.success('已办理离店')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    checkOutSubmitting.value = false
  }
}

// 完成清扫
const cleanSubmitting = ref(false)
async function handleMarkCleaned() {
  if (!selectedEntry.value) return
  cleanSubmitting.value = true
  try {
    await roomApi.markCleaned(selectedEntry.value.room.id, selectedEntry.value.room.version)
    message.success('已完成清扫')
    actionVisible.value = false
    await fetchBoard()
  } finally {
    cleanSubmitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchStores(), fetchCustomerOptions()])
  await fetchBoard()
})
</script>

<template>
  <div>
    <n-space style="margin-bottom: 16px">
      <n-select v-model:value="selectedStoreId" :options="storeOptions" style="width: min(200px, 94vw)" @update:value="fetchBoard" />
      <n-date-picker v-model:value="selectedDate" type="date" @update:value="fetchBoard" />
    </n-space>

    <n-empty v-if="!loading && boardEntries.length === 0" description="该门店暂无房间数据" />

    <div v-for="[floor, entries] in groupedByFloor" :key="floor" style="margin-bottom: 20px">
      <h3 style="margin-bottom: 8px">{{ floor }}</h3>
      <n-grid :x-gap="12" :y-gap="12" :cols="6" responsive="screen" :item-responsive="true">
        <n-gi v-for="entry in entries" :key="entry.room.id" span="6 m:3 l:2 xl:1">
          <n-card
            hoverable
            :style="{ background: statusColor[entry.status], cursor: 'pointer' }"
            size="small"
            content-style="padding: 8px 10px"
            @click="openAction(entry)"
          >
            <div class="occ-head">
              <span class="occ-no">{{ entry.room.roomNo }}</span>
              <span class="occ-type">{{ entry.room.roomType?.name }}</span>
              <span class="occ-pill" :style="statusPill[entry.status]">{{ statusLabel[entry.status] }}</span>
            </div>
            <div v-if="entry.status === 'MAINTENANCE' && entry.room.maintenanceNote" class="occ-row">
              <span class="occ-label">备注：</span>{{ entry.room.maintenanceNote }}
            </div>
            <template v-if="entry.occupancyId">
              <a v-if="entry.customerName" class="occ-customer" @click.stop="openCustomer(entry)">{{ entry.customerName }}</a>
              <!-- 预订中的日期是销售预估的（客户实际入住当天才确定），标"预计"；已入住的显示实际入住日期 -->
              <div class="occ-row">
                <span class="occ-label">{{ entry.status === 'OCCUPIED' ? '入住日期：' : '预计入住：' }}</span>{{ formatMonthDay(entry.status === 'OCCUPIED' ? entry.actualCheckInAt ?? entry.plannedCheckIn : entry.plannedCheckIn) }}
                <span class="occ-label occ-gap">{{ entry.status === 'OCCUPIED' ? '出所日期：' : '预计出所：' }}</span>{{ formatMonthDay(entry.plannedCheckOut) }}
              </div>
              <div class="occ-row occ-due" :class="{ 'occ-due-warn': isDueSoon(entry.expectedDueDate) }">
                <span class="occ-label">预产期：</span>{{ formatDay(entry.expectedDueDate) }}
              </div>
              <!-- 套餐（朝向 · 入住天数）、护理模式来自关联的合同；没有合同（直接建的预订）显示 - -->
              <div class="occ-row">
                <span class="occ-label">套餐：</span>{{ packageText(entry) }}
                <span class="occ-label occ-gap">护理模式：</span>{{ entry.contract?.careMode ? CARE_MODE_LABEL[entry.contract.careMode] : '-' }}
              </div>
              <!-- 护理等级、护理师来自这次入住的母婴档案（护理模块里维护），没建档显示 - -->
              <div class="occ-row">
                <span class="occ-label">护理等级：</span>{{ entry.careBrief?.level ? CARE_LEVEL_SHORT[entry.careBrief.level] ?? entry.careBrief.level : '-' }}
                <span class="occ-label occ-gap">护理师：</span>{{ entry.careBrief?.nurseName ?? '-' }}
              </div>
              <!-- 签单人 = 客户的归属销售（系统暂无合同级别的签单人字段） -->
              <div class="occ-row"><span class="occ-label">签单人：</span>{{ entry.signerName ?? '-' }}</div>
            </template>
          </n-card>
        </n-gi>
      </n-grid>
    </div>

    <n-modal :show="actionVisible" @update:show="(v) => (actionVisible = v)">
      <n-card
        :title="selectedEntry ? `${selectedEntry.room.roomNo}（${statusLabel[selectedEntry.status]}）` : ''"
        style="width: min(480px, 94vw)"
        :bordered="false"
        role="dialog"
        aria-modal="true"
      >
        <template v-if="selectedEntry">
          <!-- 空闲：新建预订 或 标记维修 -->
          <template v-if="selectedEntry.status === 'VACANT'">
            <h4>新建预订</h4>
            <n-form label-placement="left" label-width="80">
              <n-form-item label="客户"><n-select v-model:value="reserveModel.customerId" :options="customerOptions" filterable /></n-form-item>
              <n-form-item label="起止日期"><n-date-picker v-model:value="reserveModel.dateRange" type="daterange" style="width: 100%" /></n-form-item>
            </n-form>
            <n-space justify="end" style="margin-bottom: 16px">
              <n-button type="primary" :loading="reserveSubmitting" @click="handleReserve">创建预订</n-button>
            </n-space>
            <h4>标记维修</h4>
            <n-form label-placement="left" label-width="80">
              <n-form-item label="维修备注"><n-input v-model:value="maintenanceNote" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
            </n-form>
            <n-space justify="end">
              <n-button :loading="maintenanceSubmitting" @click="handleMaintenance">标记维修</n-button>
            </n-space>
          </template>

          <!-- 预订中：办理入住 或 取消预订 -->
          <template v-else-if="selectedEntry.status === 'RESERVED'">
            <n-descriptions :column="1" label-placement="left" style="margin-bottom: 16px">
              <n-descriptions-item label="客户">{{ selectedEntry.customerName }}</n-descriptions-item>
            </n-descriptions>
            <n-space style="margin-bottom: 16px">
              <n-button type="primary" :loading="checkInSubmitting" @click="handleCheckIn">办理入住</n-button>
            </n-space>
            <h4>取消预订</h4>
            <n-form label-placement="left" label-width="80">
              <n-form-item label="取消原因"><n-input v-model:value="cancelReason" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
            </n-form>
            <n-space justify="end">
              <n-button type="error" quaternary :loading="cancelSubmitting" @click="handleCancel">确认取消</n-button>
            </n-space>
          </template>

          <!-- 使用中：办理离店 -->
          <template v-else-if="selectedEntry.status === 'OCCUPIED'">
            <n-descriptions :column="1" label-placement="left" style="margin-bottom: 16px">
              <n-descriptions-item label="客户">{{ selectedEntry.customerName }}</n-descriptions-item>
            </n-descriptions>
            <n-space justify="end">
              <n-button type="primary" :loading="checkOutSubmitting" @click="handleCheckOut">办理离店</n-button>
            </n-space>
          </template>

          <!-- 待清扫：完成清扫 -->
          <template v-else-if="selectedEntry.status === 'PENDING_CLEANING'">
            <p style="margin-bottom: 16px">该房间处于待清扫状态。</p>
            <n-space justify="end">
              <n-button type="primary" :loading="cleanSubmitting" @click="handleMarkCleaned">完成清扫</n-button>
            </n-space>
          </template>

          <!-- 维修中：解除维修 -->
          <template v-else-if="selectedEntry.status === 'MAINTENANCE'">
            <p style="margin-bottom: 16px">维修备注：{{ selectedEntry.room.maintenanceNote || '无' }}</p>
            <n-space justify="end">
              <n-button type="primary" :loading="clearMaintenanceSubmitting" @click="handleClearMaintenance">解除维修</n-button>
            </n-space>
          </template>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.occ-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.occ-no {
  font-size: 17px;
  font-weight: 600;
  color: #222;
}
.occ-type {
  font-size: 12px;
  color: #666;
}
.occ-pill {
  margin-left: auto;
  font-size: 11px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  white-space: nowrap;
}
.occ-row {
  font-size: 12px;
  line-height: 19px;
  color: #555;
}
.occ-label {
  color: #999;
}
.occ-gap {
  margin-left: 8px;
}
/* 预产期整行加粗；距今不足7天整行（含说明文字）变红 */
.occ-due {
  font-weight: 600;
  color: #222;
}
.occ-due .occ-label {
  color: #555;
}
.occ-due-warn,
.occ-due-warn .occ-label {
  color: #d03050;
}
/* 客户姓名：比其余文字大一号，主题蓝加下划线，提示可点击 */
.occ-customer {
  display: inline-block;
  margin: 3px 0 2px;
  font-size: 15px;
  font-weight: 600;
  color: #2080f0;
  cursor: pointer;
  text-decoration: underline;
}
.occ-customer:hover {
  color: #0c62c9;
}
</style>
