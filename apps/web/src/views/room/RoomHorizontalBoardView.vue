<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NSpace, NSelect, NDatePicker, NButton, NModal, NCard, NForm, NFormItem, NInput, NTag, NEmpty, NAlert } from 'naive-ui'
import { roomApi } from '../../api/modules/room.api'
import { roomTypeApi } from '../../api/modules/room-type.api'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import { contractApi } from '../../api/modules/contract.api'
import { CARE_MODE_LABEL, ORIENTATION_LABEL, type ContractListItem } from '../../api/types/contract'
import type { Room } from '../../api/types/room'
import type { RoomType } from '../../api/types/room-type'
import type { RoomConflict, RoomOccupancy } from '../../api/types/room-occupancy'
import { message, dialog } from '../../utils/discrete-api'

// ---------------- 基础配置：单元格宽度/两列固定表头宽度 ----------------
const CELL_WIDTH = 44
const TYPE_COL_WIDTH = 92
const ROOM_COL_WIDTH = 84

const storeOptions = ref<{ label: string; value: string }[]>([])
const selectedStoreId = ref<string | null>(null)

// 以"年"为单位：一个自然年（1/1~12/31）整年横向排开，年内靠左右滑动看全部日期，
// 跨年份靠页面上的"上一年/下一年/年份下拉"切换。windowStart/dayCount 保留原来的名字，
// 下面算色块位置、超出范围提示的逻辑都是基于这两个值，改成"从年份推导"就不用动那些代码。
const currentYear = new Date().getFullYear()
const year = ref(currentYear)
const yearOptions = computed(() => {
  const from = Math.min(currentYear - 3, year.value)
  const to = Math.max(currentYear + 5, year.value)
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${from + i}年`, value: from + i }))
})
const windowStart = computed(() => new Date(year.value, 0, 1).getTime())
const dayCount = computed(() => Math.round((new Date(year.value + 1, 0, 1).getTime() - windowStart.value) / 86400000))

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000)
}
function fmtMD(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}
const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const days = computed(() => {
  const start = new Date(windowStart.value)
  const today = startOfDay(new Date()).getTime()
  return Array.from({ length: dayCount.value }, (_, i) => {
    const d = addDays(start, i)
    const ts = d.getTime()
    return {
      date: d,
      ts,
      md: fmtMD(d),
      wd: WEEKDAY_LABEL[d.getDay()],
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: ts === today,
    }
  })
})
const windowEnd = computed(() => addDays(new Date(windowStart.value), dayCount.value - 1))
const trackWidth = computed(() => dayCount.value * CELL_WIDTH)
// 表头上面那一行"1月 2月 ..."，整年 366 列光看日期数字容易迷路，月份条帮忙定位
const months = computed(() =>
  Array.from({ length: 12 }, (_, m) => ({ label: `${m + 1}月`, days: new Date(year.value, m + 1, 0).getDate() })),
)

// ---------------- 横向滚动定位：整年很宽，切年份/点"今天"/跳转都要自动滚到目标日期 ----------------
const boardWrapper = ref<HTMLElement | null>(null)
const pendingScrollDate = ref<Date | null>(null)
const locateValue = ref<number | null>(null)

async function scrollToDate(date: Date, smooth: boolean) {
  await nextTick()
  const el = boardWrapper.value
  if (!el) return
  const idx = diffDays(new Date(windowStart.value), date)
  // 往前留两格余量，目标日期不贴着左边固定列，看得清楚
  el.scrollTo({ left: Math.max(0, (idx - 2) * CELL_WIDTH), behavior: smooth ? 'smooth' : 'auto' })
}

/** 跳到某个日期：同一年直接滚过去；不同年先切年份，年份切完由下面的 watch(year) 负责滚。 */
function goToDate(date: Date) {
  if (date.getFullYear() === year.value) {
    void scrollToDate(date, true)
  } else {
    pendingScrollDate.value = date
    year.value = date.getFullYear()
  }
}

watch(year, () => {
  const target = pendingScrollDate.value ?? (year.value === currentYear ? startOfDay(new Date()) : new Date(year.value, 0, 1))
  pendingScrollDate.value = null
  void scrollToDate(target, false)
})

function changeYear(delta: number) {
  year.value += delta
}
function jumpToday() {
  goToDate(startOfDay(new Date()))
}
function onLocate(v: number | null) {
  locateValue.value = v
  if (v) goToDate(startOfDay(new Date(v)))
}

// ---------------- 数据：房间/房型/占用记录/客户 ----------------
const rooms = ref<Room[]>([])
const roomTypesById = ref<Record<string, RoomType>>({})
const occupancies = ref<RoomOccupancy[]>([])
const customerNameById = ref<Record<string, string>>({})
const customerOptions = ref<{ label: string; value: string }[]>([])
const loading = ref(false)

const groupedRooms = computed(() => {
  const list = [...rooms.value].sort((a, b) => {
    const tn = (roomTypesById.value[a.roomTypeId]?.name ?? '').localeCompare(roomTypesById.value[b.roomTypeId]?.name ?? '')
    if (tn !== 0) return tn
    return a.roomNo.localeCompare(b.roomNo, 'zh', { numeric: true })
  })
  return list
})
const roomNoById = computed(() => Object.fromEntries(rooms.value.map((r) => [r.id, r.roomNo])))

async function fetchStores() {
  const stores = await storeApi.list()
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  if (stores.length > 0 && !selectedStoreId.value) selectedStoreId.value = stores[0].id
}

async function fetchStaticData() {
  const [roomTypes, customers] = await Promise.all([roomTypeApi.list(), customerApi.list()])
  roomTypesById.value = Object.fromEntries(roomTypes.map((t) => [t.id, t]))
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
  customerNameById.value = Object.fromEntries(customers.map((c) => [c.id, c.name]))
}

// 不按当前查看年度过滤——一次性把这个门店全部未取消的占用记录都拉回来，切年份/滚动
// 纯前端重新计算，不用重新请求；"超出当前窗口"的提示条也是从这份完整数据里筛出来的，
// 不需要单独再查一次。这个门店的占用记录量级（几十~小几百条）拉全量没有性能问题。
// 预订冲突：同一间房日期重叠（或间隔不够整理）的预订——色块画成红色斜纹并上下分两行，顶上有提示条
const conflicts = ref<RoomConflict[]>([])
const conflictIds = computed(() => new Set(conflicts.value.flatMap((c) => [c.a.id, c.b.id])))
let initialScrolled = false
async function fetchBoard() {
  if (!selectedStoreId.value) return
  loading.value = true
  try {
    const [roomList, occList] = await Promise.all([
      roomApi.list({ storeId: selectedStoreId.value }),
      roomOccupancyApi.list({ storeId: selectedStoreId.value }),
    ])
    rooms.value = roomList
    occupancies.value = occList.filter((o) => o.status !== 'CANCELLED')
    conflicts.value = await roomOccupancyApi.conflicts(selectedStoreId.value).catch(() => [])
  } finally {
    loading.value = false
  }
  // 首次进入页面：整年很宽，默认滚到"今天"附近，而不是停在 1 月 1 日
  if (!initialScrolled) {
    initialScrolled = true
    void scrollToDate(startOfDay(new Date()), false)
  }
}

const occupanciesByRoom = computed(() => {
  const map = new Map<string, RoomOccupancy[]>()
  for (const occ of occupancies.value) {
    const list = map.get(occ.roomId) ?? []
    list.push(occ)
    map.set(occ.roomId, list)
  }
  return map
})

// 每个房间"哪些天已被占用"预先算成 Set：整年 366 列 × 几十个房间，如果每个格子渲染时都去
// 遍历该房间的占用记录找覆盖，重渲染一次就是几万次遍历；预先算一遍，格子里只做 O(1) 查表。
const occupiedDaysByRoom = computed(() => {
  const map = new Map<string, Set<number>>()
  const yStart = windowStart.value
  const yEndExclusive = addDays(new Date(yStart), dayCount.value).getTime()
  for (const occ of occupancies.value) {
    const from = Math.max(startOfDay(new Date(occ.plannedCheckIn)).getTime(), yStart)
    const to = Math.min(startOfDay(new Date(occ.plannedCheckOut)).getTime(), yEndExclusive)
    if (from >= to) continue
    let set = map.get(occ.roomId)
    if (!set) map.set(occ.roomId, (set = new Set()))
    for (let d = new Date(from); d.getTime() < to; d = addDays(d, 1)) set.add(d.getTime())
  }
  return map
})
function isOccupied(roomId: string, ts: number): boolean {
  return occupiedDaysByRoom.value.get(roomId)?.has(ts) ?? false
}

interface Bar {
  occ: RoomOccupancy
  left: number
  width: number
  clippedLeft: boolean
  clippedRight: boolean
  label: string
  /** 同一间房里重叠的色块分两行显示：0=上行（或独占整行），1=下行 */
  lane: number
  split: boolean
  conflict: boolean
}
function barsForRoom(roomId: string): Bar[] {
  const list = occupanciesByRoom.value.get(roomId) ?? []
  const winStart = startOfDay(new Date(windowStart.value))
  const bars: Bar[] = []
  for (const occ of list) {
    const ci = startOfDay(new Date(occ.plannedCheckIn))
    const co = startOfDay(new Date(occ.plannedCheckOut))
    const rawStart = diffDays(winStart, ci)
    const rawEnd = diffDays(winStart, co)
    // 整段都在当前年度之外的预订不画（以前只靠 width>0 过滤，实际永远为真，
    // 会在第一列留下一个孤零零的一格色块）
    if (rawEnd <= 0 || rawStart >= dayCount.value) continue
    const startIdx = Math.max(0, rawStart)
    const endIdx = Math.min(dayCount.value, rawEnd)
    const custName = customerNameById.value[occ.customerId] ?? occ.customerId
    bars.push({
      occ,
      left: startIdx * CELL_WIDTH,
      width: Math.max(1, endIdx - startIdx) * CELL_WIDTH - 2,
      clippedLeft: rawStart < 0,
      clippedRight: rawEnd > dayCount.value,
      label: `${custName}，${diffDays(ci, co)}晚，${fmtMD(ci)}-${fmtMD(co)}`,
      lane: 0,
      split: false,
      conflict: conflictIds.value.has(occ.id),
    })
  }
  // 重叠的色块分上下两行，免得互相盖住
  bars.sort((x, y) => x.left - y.left)
  const laneEnd = [-1, -1]
  for (const b of bars) {
    const lane = b.left >= laneEnd[0] ? 0 : 1
    b.lane = lane
    laneEnd[lane] = b.left + b.width + CELL_WIDTH // 留出 1 天整理间隔
  }
  const hasLane1 = bars.some((b) => b.lane === 1)
  if (hasLane1) for (const b of bars) b.split = true
  return bars
}

// ---------------- 提示条：不在当前年度内的预订，点了直接切到对应年份并滚动过去 ----------------
// 只提未取消、还"活着"的预订（RESERVED/CHECKED_IN）——已离店的历史记录不用提醒销售去翻，
// 不然门店开久了历史记录一多，这条提示会常年挂着一大堆没意义的旧数据。
interface OutOfWindowItem {
  occ: RoomOccupancy
  label: string
  checkIn: Date
}
const outOfWindowList = computed<OutOfWindowItem[]>(() => {
  const winStart = startOfDay(new Date(windowStart.value))
  const winEndExclusive = addDays(windowEnd.value, 1)
  const center = startOfDay(new Date()).getTime()
  return occupancies.value
    .filter((o) => ['RESERVED', 'CHECKED_IN'].includes(o.status))
    .filter((o) => {
      const ci = startOfDay(new Date(o.plannedCheckIn))
      const co = startOfDay(new Date(o.plannedCheckOut))
      return !(ci.getTime() < winEndExclusive.getTime() && co.getTime() > winStart.getTime())
    })
    .map((o) => {
      const ci = new Date(o.plannedCheckIn)
      const co = new Date(o.plannedCheckOut)
      const roomNo = roomNoById.value[o.roomId] ?? o.roomId
      const custName = customerNameById.value[o.customerId] ?? o.customerId
      return { occ: o, label: `${roomNo} · ${custName} ${fmtMD(ci)}-${fmtMD(co)}`, checkIn: ci }
    })
    .sort((a, b) => Math.abs(a.checkIn.getTime() - center) - Math.abs(b.checkIn.getTime() - center))
})

function jumpToOccupancy(item: OutOfWindowItem) {
  goToDate(startOfDay(item.checkIn))
}

// ---------------- 待排房合同 ----------------
// 合同上只写房型不写房号，销售按"签单先后"在这张图上手工排房。已确认、还没有有效预订的合同会列在这里，
// 点一份合同再点图上的空档，就按合同信息（客户、入住天数、预估日期）生成预订并关联这份合同。
// 合同上的入住日期只是预估（预产期推后几天），客户实际入住当天才确定——排好之后随时可以改期。
const route = useRoute()
const router = useRouter()
const pendingContracts = ref<ContractListItem[]>([])
const activeContractId = ref<string | null>(null)
const activeContract = computed(() => pendingContracts.value.find((c) => c.id === activeContractId.value) ?? null)

async function fetchPendingContracts() {
  try {
    pendingContracts.value = await contractApi.list({ unassigned: true })
  } catch {
    pendingContracts.value = [] // 没有合同查看权限的账号不显示这个面板
  }
  if (activeContractId.value && !activeContract.value) activeContractId.value = null
}

function contractLabel(c: ContractListItem): string {
  const room = c.roomType?.name ?? c.roomTypeText ?? '房型未填'
  const orient = c.orientation ? ORIENTATION_LABEL[c.orientation] : ''
  const md = (iso: string | null) => (iso ? iso.slice(5, 10) : '?')
  return `${c.customer?.name ?? c.clientName ?? '-'} · ${room}${orient ? ' ' + orient : ''} · ${c.careMode ? CARE_MODE_LABEL[c.careMode] : ''} ${c.inHouseDays ?? '?'}天 · 预估 ${md(c.estimatedCheckIn)}→${md(c.estimatedCheckOut)}`
}

function pickContract(c: ContractListItem) {
  activeContractId.value = activeContractId.value === c.id ? null : c.id
  // 预估入住日期不在当前年份时，切到对应年份并滚到那一天，方便直接排
  if (activeContractId.value && c.estimatedCheckIn) goToDate(startOfDay(new Date(c.estimatedCheckIn.slice(0, 10) + 'T00:00:00')))
}

/** 房型与合同一致的房间高亮（合同上只有房型，销售要在这些房间里挑）。 */
function roomMatchesContract(room: Room): boolean {
  const c = activeContract.value
  return !!c && !!c.roomTypeId && room.roomTypeId === c.roomTypeId
}

// ---------------- 点空格：新建预订 ----------------
const createVisible = ref(false)
const createTarget = ref<{ room: Room; date: Date } | null>(null)
const createModel = ref({ customerId: null as string | null, dateRange: null as [number, number] | null, remark: '', contractId: null as string | null })
const createSubmitting = ref(false)

function onCellClick(room: Room, date: Date) {
  if (room.underMaintenance) {
    message.warning('该房间维修中，暂不可预订')
    return
  }
  const c = activeContract.value
  if (c) {
    // 正在为某份合同排房：入住日期取你点的这一天，离店 = 入住 + 合同的入住天数（后面都能改）
    if (c.roomTypeId && room.roomTypeId !== c.roomTypeId) {
      const want = c.roomType?.name ?? c.roomTypeText ?? ''
      const have = roomTypesById.value[room.roomTypeId]?.name ?? ''
      dialog.warning({
        title: '房型与合同不一致',
        content: `合同上是「${want}」，${room.roomNo} 是「${have}」。仍要把 ${c.customer?.name ?? c.clientName} 排到这间房吗？`,
        positiveText: '仍然排入',
        negativeText: '取消',
        onPositiveClick: () => openCreateForContract(room, date, c),
      })
      return
    }
    openCreateForContract(room, date, c)
    return
  }
  createTarget.value = { room, date }
  createModel.value = { customerId: null, dateRange: [date.getTime(), addDays(date, 1).getTime()], remark: '', contractId: null }
  createVisible.value = true
}

function openCreateForContract(room: Room, date: Date, c: ContractListItem) {
  createTarget.value = { room, date }
  createModel.value = {
    customerId: c.customerId,
    dateRange: [date.getTime(), addDays(date, c.inHouseDays ?? 28).getTime()],
    remark: `合同 ${c.paperNo || c.contractNo}${c.careMode ? '，' + CARE_MODE_LABEL[c.careMode] : ''}`,
    contractId: c.id,
  }
  createVisible.value = true
}

async function handleCreate() {
  if (!createTarget.value || !createModel.value.customerId || !createModel.value.dateRange) {
    message.error('请选择客户和起止日期')
    return
  }
  createSubmitting.value = true
  try {
    const created = await roomOccupancyApi.create({
      roomId: createTarget.value.room.id,
      storeId: createTarget.value.room.storeId,
      customerId: createModel.value.customerId,
      plannedCheckIn: new Date(createModel.value.dateRange[0]).toISOString(),
      plannedCheckOut: new Date(createModel.value.dateRange[1]).toISOString(),
      remark: createModel.value.remark || undefined,
      contractId: createModel.value.contractId ?? undefined,
    })
    message.success(createModel.value.contractId ? '已排房，合同已从待排房列表移出' : '预订已创建')
    if (created.conflicts?.length) message.warning(`注意：和 ${created.conflicts.map((c) => c.customerName).join('、')} 的预订日期重叠（或间隔不够整理房间），已加入“预订冲突”待协调清单`, { duration: 8000, closable: true })
    createVisible.value = false
    if (createModel.value.contractId) activeContractId.value = null
    await Promise.all([fetchBoard(), fetchPendingContracts()])
  } finally {
    createSubmitting.value = false
  }
}

// ---------------- 点色块：查看/改期/入住/离店/取消 ----------------
const detailVisible = ref(false)
const detailOcc = ref<RoomOccupancy | null>(null)
const detailDateRange = ref<[number, number] | null>(null)
const detailSubmitting = ref(false)
const cancelReason = ref('')

function openDetail(occ: RoomOccupancy) {
  detailOcc.value = occ
  detailDateRange.value = [new Date(occ.plannedCheckIn).getTime(), new Date(occ.plannedCheckOut).getTime()]
  cancelReason.value = ''
  detailVisible.value = true
}

async function handleReschedule() {
  if (!detailOcc.value || !detailDateRange.value) return
  detailSubmitting.value = true
  try {
    const updated = await roomOccupancyApi.reschedule(
      detailOcc.value.id,
      new Date(detailDateRange.value[0]).toISOString(),
      new Date(detailDateRange.value[1]).toISOString(),
      detailOcc.value.version,
    )
    detailOcc.value = updated
    message.success('改期成功')
    if (updated.conflicts?.length) message.warning(`注意：和 ${updated.conflicts.map((c) => c.customerName).join('、')} 的预订日期重叠（或间隔不够整理房间），已加入“预订冲突”待协调清单`, { duration: 8000, closable: true })
    await fetchBoard()
  } finally {
    detailSubmitting.value = false
  }
}

async function handleCheckIn() {
  if (!detailOcc.value) return
  detailSubmitting.value = true
  try {
    await roomOccupancyApi.checkIn(detailOcc.value.id, detailOcc.value.version)
    message.success('已办理入住')
    detailVisible.value = false
    await fetchBoard()
  } finally {
    detailSubmitting.value = false
  }
}

async function handleCheckOut() {
  if (!detailOcc.value) return
  detailSubmitting.value = true
  try {
    await roomOccupancyApi.checkOut(detailOcc.value.id, detailOcc.value.version)
    message.success('已办理离店')
    detailVisible.value = false
    await fetchBoard()
  } finally {
    detailSubmitting.value = false
  }
}

function handleCancelClick() {
  if (!detailOcc.value) return
  if (!cancelReason.value.trim()) {
    message.error('请填写取消原因')
    return
  }
  dialog.warning({
    title: '取消预订',
    content: `确认取消「${detailOcc.value.occupancyNo}」这条预订吗？`,
    positiveText: '确认取消',
    negativeText: '再想想',
    onPositiveClick: async () => {
      if (!detailOcc.value) return
      await roomOccupancyApi.cancel(detailOcc.value.id, cancelReason.value, detailOcc.value.version)
      message.success('预订已取消')
      detailVisible.value = false
      await fetchBoard()
    },
  })
}

// ---------------- 房间标签：维修状态快捷维护 ----------------
const maintVisible = ref(false)
const maintTarget = ref<Room | null>(null)
const maintNote = ref('')
const maintSubmitting = ref(false)

function openMaintenance(room: Room, ev: MouseEvent) {
  ev.stopPropagation()
  maintTarget.value = room
  maintNote.value = room.maintenanceNote ?? ''
  maintVisible.value = true
}

async function handleSetMaintenance(under: boolean) {
  if (!maintTarget.value) return
  maintSubmitting.value = true
  try {
    await roomApi.setMaintenance(maintTarget.value.id, under, under ? maintNote.value || undefined : undefined, maintTarget.value.version)
    message.success(under ? '已置为维修中' : '已解除维修标志')
    maintVisible.value = false
    await fetchBoard()
  } finally {
    maintSubmitting.value = false
  }
}

// 只有切门店才需要重新拉数据；切年份只是前端换个窗口重新算，同一份数据够用。
watch(selectedStoreId, fetchBoard)

onMounted(async () => {
  // fetchStores() 内部会把 selectedStoreId 设成第一个门店，触发上面的 watch 去拉数据，
  // 不需要在这里再显式调一次 fetchBoard()，不然首屏会多打一次重复请求。
  await Promise.all([fetchStores(), fetchStaticData(), fetchPendingContracts()])
  // 从合同页点"去排房"过来时，直接选中那份合同
  const fromContract = route.query.contract as string | undefined
  if (fromContract) {
    router.replace({ path: route.path })
    const c = pendingContracts.value.find((x) => x.id === fromContract)
    if (c) pickContract(c)
    else message.info('这份合同已经排过房，或还没有确认入库')
  }
})
</script>

<template>
  <div>
    <n-space align="center" style="margin-bottom: 12px" :wrap="true">
      <n-select v-model:value="selectedStoreId" :options="storeOptions" style="width: min(180px, 94vw)" />
      <n-button @click="changeYear(-1)">◀ {{ year - 1 }}年</n-button>
      <n-select v-model:value="year" :options="yearOptions" style="width: min(110px, 94vw)" />
      <n-button @click="changeYear(1)">{{ year + 1 }}年 ▶</n-button>
      <n-button @click="jumpToday">今天</n-button>
      <n-date-picker :value="locateValue" type="date" clearable placeholder="定位到日期" style="width: min(150px, 94vw)" @update:value="onLocate" />
      <n-space :size="6" style="margin-left: 12px">
        <n-tag size="small" :bordered="false" style="background: #e6f3ff; color: #1a73c7">■ 预订中</n-tag>
        <n-tag size="small" :bordered="false" style="background: #e3f7ea; color: #1a8f4c">■ 已入住</n-tag>
        <n-tag size="small" :bordered="false" style="background: #eeeeee; color: #777">■ 已离店</n-tag>
        <n-tag size="small" :bordered="false" style="background: repeating-linear-gradient(45deg,#eee,#eee 4px,#e2e2e2 4px,#e2e2e2 8px); color: #888">▦ 维修中</n-tag>
      </n-space>
    </n-space>

    <n-alert v-if="conflicts.length > 0" type="error" style="margin-bottom: 12px" :show-icon="false">
      <b>有 {{ conflicts.length }} 处预订冲突</b>（同一间房日期重叠，或两位之间不够整理房间，色块已标成红色斜纹）。预订阶段允许这样排，入住前要协调好：
      <router-link to="/room/conflicts" style="margin-left: 6px">去协调（可一键换空房 / 改日期）</router-link>
    </n-alert>

    <div v-if="pendingContracts.length > 0" class="pending-panel">
      <div class="pending-title">
        待排房合同（{{ pendingContracts.length }}）<span class="pending-sub">按签单先后排序；点一份合同，再点下方房态图上的空档排房</span>
      </div>
      <div class="pending-list">
        <div v-for="c in pendingContracts" :key="c.id" class="pending-card" :class="{ active: c.id === activeContractId }" @click="pickContract(c)">
          {{ contractLabel(c) }}
        </div>
      </div>
      <n-alert v-if="activeContract" type="success" style="margin-top: 8px" closable @close="activeContractId = null">
        正在为 <b>{{ activeContract.customer?.name ?? activeContract.clientName }}</b> 排房：
        <template v-if="activeContract.roomTypeId">房型相符的房间已高亮，</template>点击房间那一行的空档，入住日期按你点的那天算，离店 = 入住 + {{ activeContract.inHouseDays ?? 28 }} 天。
      </n-alert>
    </div>

    <n-alert v-if="outOfWindowList.length > 0" type="info" style="margin-bottom: 12px" closable>
      <template #header>该门店还有 {{ outOfWindowList.length }} 条预订不在 {{ year }} 年度内，点击可切换到对应年份查看：</template>
      <n-space :size="[8, 8]">
        <n-tag
          v-for="item in outOfWindowList.slice(0, 8)"
          :key="item.occ.id"
          size="small"
          checkable
          style="cursor: pointer"
          @click="jumpToOccupancy(item)"
        >
          {{ item.label }}
        </n-tag>
        <span v-if="outOfWindowList.length > 8" style="color: #999; font-size: 12px; align-self: center">
          等共 {{ outOfWindowList.length }} 条
        </span>
      </n-space>
    </n-alert>

    <n-empty v-if="!loading && groupedRooms.length === 0" description="该门店暂无房间数据" />

    <div v-else ref="boardWrapper" class="board-wrapper">
      <div class="board-inner" :style="{ width: TYPE_COL_WIDTH + ROOM_COL_WIDTH + trackWidth + 'px' }">
        <!-- 表头：月份条 + 日期行，整体吸顶 -->
        <div class="header-block">
          <div class="header-row month-row">
            <div class="sticky-col month-corner" :style="{ width: TYPE_COL_WIDTH + ROOM_COL_WIDTH + 'px' }">{{ year }}年</div>
            <div v-for="m in months" :key="m.label" class="month-cell" :style="{ width: m.days * CELL_WIDTH + 'px' }"><span class="month-label" :style="{ left: TYPE_COL_WIDTH + ROOM_COL_WIDTH + 8 + 'px' }">{{ m.label }}</span></div>
          </div>
          <div class="header-row">
            <div class="sticky-col type-col header-cell" :style="{ width: TYPE_COL_WIDTH + 'px' }">房型</div>
            <div class="sticky-col room-col header-cell" :style="{ width: ROOM_COL_WIDTH + 'px', left: TYPE_COL_WIDTH + 'px' }">房间</div>
            <div
              v-for="d in days"
              :key="d.ts"
              class="day-header"
              :class="{ weekend: d.isWeekend, today: d.isToday }"
              :style="{ width: CELL_WIDTH + 'px' }"
            >
              <div class="day-md">{{ d.md }}</div>
              <div class="day-wd">{{ d.wd }}</div>
            </div>
          </div>
        </div>

        <!-- 房间行 -->
        <div v-for="room in groupedRooms" :key="room.id" class="room-row">
          <div class="sticky-col type-col body-cell" :class="{ 'room-match': roomMatchesContract(room) }" :style="{ width: TYPE_COL_WIDTH + 'px' }">{{ roomTypesById[room.roomTypeId]?.name ?? '-' }}</div>
          <div
            class="sticky-col room-col body-cell room-label" :class="{ 'room-match': roomMatchesContract(room) }"
            :style="{ width: ROOM_COL_WIDTH + 'px', left: TYPE_COL_WIDTH + 'px' }"
            @click="(ev) => openMaintenance(room, ev)"
          >
            {{ room.roomNo }}
            <n-tag v-if="room.underMaintenance" size="tiny" type="warning" :bordered="false" style="margin-left: 4px">修</n-tag>
          </div>
          <div class="track" :style="{ width: trackWidth + 'px' }">
            <div v-if="room.underMaintenance" class="maint-overlay" :style="{ width: trackWidth + 'px' }" />
            <div
              v-for="d in days"
              :key="d.ts"
              class="day-cell"
              :class="{ weekend: d.isWeekend, today: d.isToday, disabled: isOccupied(room.id, d.ts) || room.underMaintenance }"
              :style="{ width: CELL_WIDTH + 'px' }"
              @click="() => !isOccupied(room.id, d.ts) && onCellClick(room, d.date)"
            />
            <div
              v-for="bar in barsForRoom(room.id)"
              :key="bar.occ.id"
              class="occ-bar"
              :class="[bar.occ.status.toLowerCase(), { 'clip-left': bar.clippedLeft, 'clip-right': bar.clippedRight, conflict: bar.conflict, split: bar.split }]"
              :style="{ left: bar.left + 'px', width: bar.width + 'px', ...(bar.split ? { top: 3 + bar.lane * 18 + 'px' } : {}) }"
              :title="bar.label"
              @click.stop="openDetail(bar.occ)"
            >
              <span class="bar-label" :style="{ left: TYPE_COL_WIDTH + ROOM_COL_WIDTH + 6 + 'px' }">{{ bar.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建预订（点空格触发） -->
    <n-modal :show="createVisible" @update:show="(v) => (createVisible = v)">
      <n-card
        :title="createTarget ? `新建预订 - ${createTarget.room.roomNo}` : '新建预订'"
        style="width: min(440px, 94vw)"
        :bordered="false"
        role="dialog"
        aria-modal="true"
      >
        <n-form label-placement="left" label-width="80">
          <n-form-item label="客户"><n-select v-model:value="createModel.customerId" :options="customerOptions" filterable placeholder="搜索姓名/手机号" /></n-form-item>
          <n-form-item label="起止日期"><n-date-picker v-model:value="createModel.dateRange" type="daterange" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="createModel.remark" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="createVisible = false">取消</n-button>
            <n-button type="primary" :loading="createSubmitting" @click="handleCreate">创建预订</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 详情/改期/入住/离店/取消（点色块触发） -->
    <n-modal :show="detailVisible" @update:show="(v) => (detailVisible = v)">
      <n-card v-if="detailOcc" :title="`${detailOcc.occupancyNo}（${customerNameById[detailOcc.customerId] ?? ''}）`" style="width: min(460px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="计划日期">
            <n-date-picker v-model:value="detailDateRange" type="daterange" style="width: 100%" :disabled="!['RESERVED', 'CHECKED_IN'].includes(detailOcc.status)" />
          </n-form-item>
        </n-form>
        <n-space v-if="['RESERVED', 'CHECKED_IN'].includes(detailOcc.status)" style="margin-bottom: 16px">
          <n-button :loading="detailSubmitting" @click="handleReschedule">保存改期</n-button>
          <n-button v-if="detailOcc.status === 'RESERVED'" type="primary" :loading="detailSubmitting" @click="handleCheckIn">办理入住</n-button>
          <n-button v-if="detailOcc.status === 'CHECKED_IN'" type="primary" :loading="detailSubmitting" @click="handleCheckOut">办理离店</n-button>
        </n-space>
        <template v-if="detailOcc.status === 'RESERVED'">
          <n-form label-placement="left" label-width="80">
            <n-form-item label="取消原因"><n-input v-model:value="cancelReason" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
          </n-form>
          <n-space justify="end">
            <n-button type="error" quaternary @click="handleCancelClick">取消预订</n-button>
          </n-space>
        </template>
        <p v-else-if="!['RESERVED', 'CHECKED_IN'].includes(detailOcc.status)" style="color: #999; margin: 0">
          该占用记录已{{ detailOcc.status === 'CHECKED_OUT' ? '离店' : '取消' }}，仅供查看。
        </p>
      </n-card>
    </n-modal>

    <!-- 维修状态维护（点房间号触发） -->
    <n-modal :show="maintVisible" @update:show="(v) => (maintVisible = v)">
      <n-card :title="maintTarget ? `维修状态 - ${maintTarget.roomNo}` : ''" style="width: min(400px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <template v-if="maintTarget">
          <template v-if="!maintTarget.underMaintenance">
            <n-form label-placement="left" label-width="80">
              <n-form-item label="维修备注"><n-input v-model:value="maintNote" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
            </n-form>
            <n-space justify="end">
              <n-button :loading="maintSubmitting" @click="handleSetMaintenance(true)">标记维修</n-button>
            </n-space>
          </template>
          <template v-else>
            <p style="margin-bottom: 16px">维修备注：{{ maintTarget.maintenanceNote || '无' }}</p>
            <n-space justify="end">
              <n-button type="primary" :loading="maintSubmitting" @click="handleSetMaintenance(false)">解除维修</n-button>
            </n-space>
          </template>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.board-wrapper {
  overflow: auto;
  /* 房间多时纵向在表格内部滚动，月份条+日期行吸顶不丢 */
  max-height: calc(100vh - 300px);
  min-height: 240px;
  border: 1px solid #eee;
  border-radius: 6px;
}
.board-inner {
  position: relative;
}
.header-row,
.room-row {
  display: flex;
}
.header-block {
  position: sticky;
  top: 0;
  z-index: 6;
  background: #fafafa;
  border-bottom: 1px solid #e5e5e5;
}
.month-row {
  border-bottom: 1px solid #eee;
}
.month-corner {
  flex: none;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: #fafafa;
  z-index: 4;
}
.month-label {
  /* 月份文字随横向滚动吸在固定列右侧，滚到哪个月都能看到当前是几月 */
  position: sticky;
  display: inline-block;
}
.month-cell {
  flex: none;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1a73c7;
  border-left: 1px solid #e5e5e5;
  background: #f3f8ff;
}
.header-cell {
  flex: none;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  padding: 8px 6px;
  background: #fafafa;
}
.sticky-col {
  position: sticky;
  left: 0;
  /* 必须高于占用色块(.occ-bar z-index:2)，否则横向滚动后色块会盖住房型/房间号 */
  z-index: 4;
  background: #fff;
  box-sizing: border-box;
  border-right: 1px solid #eee;
}
.type-col {
  left: 0;
}
.room-col {
  z-index: 4;
}
.body-cell {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 13px;
  color: #666;
}
.room-label {
  font-weight: 600;
  color: #1a73c7;
  cursor: pointer;
}
.day-header {
  flex: none;
  text-align: center;
  padding: 6px 0;
  border-left: 1px solid #f0f0f0;
  font-size: 12px;
  color: #666;
}
.day-header.weekend {
  background: #fff7f0;
}
.day-header.today {
  background: #fff1d6;
  font-weight: 700;
  color: #b8721a;
}
.day-md {
  line-height: 1.3;
}
.day-wd {
  font-size: 11px;
  color: #999;
}
.room-row {
  border-bottom: 1px solid #f2f2f2;
  min-height: 40px;
}
.track {
  position: relative;
  flex: none;
  display: flex;
}
.day-cell {
  flex: none;
  height: 40px;
  border-left: 1px solid #f5f5f5;
  cursor: pointer;
}
.day-cell.weekend {
  background: #fffaf5;
}
.day-cell.today {
  background: #fff8ea;
}
.day-cell.disabled {
  cursor: default;
}
.maint-overlay {
  position: absolute;
  top: 0;
  left: 0;
  height: 40px;
  background: repeating-linear-gradient(45deg, #f2f2f2, #f2f2f2 6px, #e6e6e6 6px, #e6e6e6 12px);
  z-index: 1;
  pointer-events: none;
}
.occ-bar {
  position: absolute;
  top: 5px;
  height: 30px;
  line-height: 30px;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
  /* 用 clip 而不是 hidden：hidden 会让色块自己变成滚动容器，里面的文字就没法随横向滚动吸附 */
  overflow: clip;
  cursor: pointer;
  z-index: 2;
}
.bar-label {
  /* 长住的色块起点滚出屏幕后，文字吸在固定列右侧继续可见，不然整年视图里长条只剩半截字 */
  position: sticky;
  display: inline-block;
}
.occ-bar.reserved {
  background: #4098fc;
}
.occ-bar.checked_in {
  background: #2bb673;
}
.occ-bar.checked_out {
  background: #b0b0b0;
}
.occ-bar.split {
  height: 16px;
  line-height: 16px;
  font-size: 11px;
}
/* 预订冲突：红色斜纹 + 红边框 */
.occ-bar.conflict {
  background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.28) 5px, transparent 5px, transparent 10px);
  outline: 2px solid #d03050;
  outline-offset: -2px;
}
.occ-bar.conflict.reserved {
  background-color: #e0566f;
}
.occ-bar.clip-left {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.occ-bar.clip-right {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.pending-panel {
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid #d9e8ff;
  border-radius: 8px;
  background: #f5f9ff;
}
.pending-title {
  font-size: 13px;
  font-weight: 600;
}
.pending-sub {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: #888;
}
.pending-list {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.pending-card {
  flex: 0 0 auto;
  padding: 4px 10px;
  border: 1px solid #cfe0f7;
  border-radius: 14px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.pending-card.active {
  border-color: #18a058;
  background: #e8f8f0;
  font-weight: 600;
}
.room-match {
  background: #e8f8f0 !important;
  box-shadow: inset 3px 0 0 #18a058;
}
</style>
