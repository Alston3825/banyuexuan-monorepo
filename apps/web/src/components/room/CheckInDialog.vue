<script setup lang="ts">
/**
 * 办理入住：预订只是“预计”，现场销售按实际情况定——房间、入住日期、入住天数（=离店日期）都可以改。
 * 选房列表显示每间房现在的情况（空闲/待清扫/另有预订/在住/逾期未离店/维修），在住和维修的不能选。
 */
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NCheckbox, NDatePicker, NForm, NFormItem, NInputNumber, NModal, NSelect, NSpace } from 'naive-ui'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import type { CheckInRoom, RoomOccupancy } from '../../api/types/room-occupancy'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ show: boolean; occupancyId: string | null; customerName?: string | null }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()

const DAY = 86400_000
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const fmt = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const occ = ref<RoomOccupancy | null>(null)
const rooms = ref<CheckInRoom[]>([])
const roomId = ref<string | null>(null)
const inDate = ref<number>(startOfDay(Date.now()))
const outDate = ref<number>(startOfDay(Date.now()) + 28 * DAY)
const days = ref<number | null>(28)
const release = ref(false)
const submitting = ref(false)

const STATE_TEXT: Record<string, string> = { FREE: '空闲', PENDING_CLEANING: '待清扫', RESERVED_CLASH: '另有预订', OVERDUE: '逾期未离店', IN_HOUSE: '在住', MAINTENANCE: '维修中' }
const options = computed(() =>
  rooms.value.map((r) => ({
    label: `${r.roomNo}（${r.floor}层·${r.roomTypeName}）${r.isBooked ? ' ★预订房' : ''} · ${STATE_TEXT[r.state]}`,
    value: r.id,
    disabled: r.state === 'IN_HOUSE' || r.state === 'MAINTENANCE',
  })),
)
const picked = computed(() => rooms.value.find((r) => r.id === roomId.value) ?? null)

async function loadRooms() {
  if (!occ.value) return
  rooms.value = await roomOccupancyApi.checkInRooms(occ.value.id, new Date(inDate.value).toISOString(), new Date(outDate.value).toISOString())
}
watch(
  () => [props.show, props.occupancyId],
  async () => {
    if (!props.show || !props.occupancyId) return
    occ.value = await roomOccupancyApi.get(props.occupancyId)
    const booked = Math.max(1, Math.round((startOfDay(new Date(occ.value.plannedCheckOut).getTime()) - startOfDay(new Date(occ.value.plannedCheckIn).getTime())) / DAY))
    inDate.value = startOfDay(Date.now())
    days.value = booked
    outDate.value = inDate.value + booked * DAY
    roomId.value = occ.value.roomId
    release.value = false
    await loadRooms()
  },
)
let t: ReturnType<typeof setTimeout> | null = null
const reload = () => {
  if (t) clearTimeout(t)
  t = setTimeout(loadRooms, 250)
}
function onInDate(v: number | null) {
  if (v === null) return
  inDate.value = startOfDay(v)
  outDate.value = inDate.value + (days.value ?? 1) * DAY
  reload()
}
function onDays(v: number | null) {
  days.value = v
  if (v) outDate.value = inDate.value + v * DAY
  reload()
}
function onOut(v: number | null) {
  if (v === null) return
  outDate.value = startOfDay(v)
  days.value = Math.max(1, Math.round((outDate.value - inDate.value) / DAY))
  reload()
}
watch(roomId, () => (release.value = false))

async function submit() {
  if (!occ.value || !roomId.value) return void message.error('请选择房间')
  if (outDate.value <= inDate.value) return void message.error('离店日期必须晚于入住日期')
  if (picked.value?.state === 'OVERDUE' && !release.value) return void message.error('这间房上一位客户已过预计离店日，请勾选“已离开，同时替 TA 办离店”，或换一间房')
  submitting.value = true
  try {
    const res = await roomOccupancyApi.checkIn(occ.value.id, occ.value.version, {
      roomId: roomId.value,
      checkInDate: new Date(inDate.value).toISOString(),
      plannedCheckOut: new Date(outDate.value).toISOString(),
      releaseOverdue: release.value || undefined,
    })
    message.success(`已办理入住：${picked.value?.roomNo} 房，${fmt(inDate.value)} ~ ${fmt(outDate.value)}（${days.value} 天）`)
    if (res.conflicts?.length) message.warning(`注意：和 ${res.conflicts.map((c) => c.customerName).join('、')} 的预订日期重叠，已加入“预订冲突”待协调清单`, { duration: 8000, closable: true })
    emit('update:show', false)
    emit('done')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <n-modal :mask-closable="false" :show="show" @update:show="(v: boolean) => emit('update:show', v)">
    <n-card :title="`办理入住${customerName ? ' - ' + customerName : ''}`" style="width: min(520px, 96vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="emit('update:show', false)">
      <n-alert v-if="occ" type="info" :show-icon="false" style="margin-bottom: 12px">
        预订：{{ new Date(occ.plannedCheckIn).toLocaleDateString() }} ~ {{ new Date(occ.plannedCheckOut).toLocaleDateString() }}。预订只是预计，下面按<b>实际情况</b>安排，可改房间、入住日期和天数。
      </n-alert>
      <n-form label-placement="top">
        <n-form-item label="实际入住的房间（可搜索房号）">
          <n-select v-model:value="roomId" :options="options" filterable size="large" placeholder="选择房间" />
        </n-form-item>
        <n-alert v-if="picked && picked.state !== 'FREE' && !picked.isBooked && picked.state === 'PENDING_CLEANING'" type="warning" style="margin-bottom: 12px">这间房还没清扫，请确认已安排保洁。</n-alert>
        <n-alert v-if="picked && picked.state === 'RESERVED_CLASH'" type="warning" style="margin-bottom: 12px">{{ picked.note }}。仍可入住，系统会把冲突放进“预订冲突”清单让销售协调。</n-alert>
        <template v-if="picked && picked.state === 'OVERDUE'">
          <n-alert type="warning" style="margin-bottom: 8px">{{ picked.note }}，已超过预计离店日但系统里还没办离店。</n-alert>
          <n-checkbox v-model:checked="release" style="margin-bottom: 12px">TA 已经离开，同时替 TA 办理离店</n-checkbox>
        </template>
        <n-alert v-if="picked && picked.state === 'IN_HOUSE'" type="error" style="margin-bottom: 12px">{{ picked.note }}，不能入住。</n-alert>
        <div class="ci-grid">
          <n-form-item label="入住日期"><n-date-picker :value="inDate" type="date" style="width: 100%" @update:value="onInDate" /></n-form-item>
          <n-form-item label="入住天数"><n-input-number :value="days" :min="1" :max="365" :precision="0" style="width: 100%" @update:value="onDays" /></n-form-item>
          <n-form-item label="离店日期"><n-date-picker :value="outDate" type="date" style="width: 100%" @update:value="onOut" /></n-form-item>
        </div>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" :loading="submitting" @click="submit">确认入住</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.ci-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0 12px;
}
</style>
