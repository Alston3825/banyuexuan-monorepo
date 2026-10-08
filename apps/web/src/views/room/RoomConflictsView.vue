<script setup lang="ts">
/**
 * 预订冲突（待协调）：同一间房两条预订日期重叠，或两位之间不够整理房间的天数。
 * 预订阶段允许这样排（日期本来就是预估的），入住前在这里协调：换到空房，或改预估日期。
 */
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NDatePicker, NEmpty, NModal, NRadio, NRadioGroup, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import { storeApi } from '../../api/modules/store.api'
import type { ConflictBrief, FreeRoom, RoomConflict } from '../../api/types/room-occupancy'
import { message } from '../../utils/discrete-api'

const conflicts = ref<RoomConflict[]>([])
const loading = ref(false)
const stores = ref<{ label: string; value: string }[]>([])
const storeId = ref<string | null>(null)

const day = (iso: string) => iso.slice(0, 10)
const nights = (a: ConflictBrief) => Math.round((new Date(a.plannedCheckOut).getTime() - new Date(a.plannedCheckIn).getTime()) / 86400_000)

async function load() {
  loading.value = true
  try {
    conflicts.value = await roomOccupancyApi.conflicts(storeId.value ?? undefined)
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  stores.value = (await storeApi.list()).map((s) => ({ label: s.name, value: s.id }))
  await load()
})

const whenText = (c: RoomConflict) => (c.startsInDays <= 0 ? '已经开始' : `${c.startsInDays} 天后开始`)

// ---------------- 换房 ----------------
const moveTarget = ref<{ conflict: RoomConflict; side: ConflictBrief } | null>(null)
const freeRooms = ref<FreeRoom[]>([])
const pickedRoom = ref<string | null>(null)
const moving = ref(false)
async function openMove(conflict: RoomConflict, side: ConflictBrief) {
  moveTarget.value = { conflict, side }
  pickedRoom.value = null
  freeRooms.value = await roomOccupancyApi.freeRooms(side.id)
}
async function doMove() {
  if (!moveTarget.value || !pickedRoom.value) return void message.error('请选一间空房')
  moving.value = true
  try {
    const occ = await roomOccupancyApi.get(moveTarget.value.side.id)
    await roomOccupancyApi.changeRoom(occ.id, pickedRoom.value, occ.version)
    message.success(`已把 ${moveTarget.value.side.customerName} 换到 ${freeRooms.value.find((r) => r.id === pickedRoom.value)?.roomNo}`)
    moveTarget.value = null
    await load()
  } finally {
    moving.value = false
  }
}

// ---------------- 改日期 ----------------
const dateTarget = ref<ConflictBrief | null>(null)
const range = ref<[number, number] | null>(null)
const rescheduling = ref(false)
function openDate(side: ConflictBrief) {
  dateTarget.value = side
  range.value = [new Date(side.plannedCheckIn).getTime(), new Date(side.plannedCheckOut).getTime()]
}
async function doDate() {
  if (!dateTarget.value || !range.value) return
  rescheduling.value = true
  try {
    const occ = await roomOccupancyApi.get(dateTarget.value.id)
    const res = await roomOccupancyApi.reschedule(occ.id, new Date(range.value[0]).toISOString(), new Date(range.value[1]).toISOString(), occ.version)
    message.success('预估日期已修改')
    if (res.conflicts?.length) message.warning('改完后仍和别的预订冲突，请继续协调')
    dateTarget.value = null
    await load()
  } finally {
    rescheduling.value = false
  }
}

const activeCount = computed(() => conflicts.value.length)
</script>

<template>
  <n-spin :show="loading">
    <n-space align="center" style="margin-bottom: 10px">
      <n-select v-model:value="storeId" :options="stores" clearable placeholder="全部门店" style="width: 180px" @update:value="load" />
      <n-button size="small" @click="load">刷新</n-button>
    </n-space>

    <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
      月子中心的预订日期是预估的，所以预订时允许同一间房日期重叠，这里把重叠的列出来，入住前协调好：<b>换到空房</b> 或 <b>改预估日期</b>。
      上一位离店后默认要隔 1 天整理房间，不够的也会列在这里。已入住的客人不能被调整，系统会建议调整另一位。
    </n-alert>

    <n-empty v-if="!loading && activeCount === 0" description="没有预订冲突 🎉" style="margin-top: 50px" />

    <n-card v-for="c in conflicts" :key="c.a.id + c.b.id" size="small" class="rc-card">
      <div class="rc-head">
        <b>{{ c.roomNo }} 房</b>
        <n-tag size="small" :type="c.bufferOnly ? 'warning' : 'error'" :bordered="false">{{ c.bufferOnly ? '间隔不够整理房间' : `日期重叠 ${c.overlapDays} 天` }}</n-tag>
        <span class="rc-sub">{{ whenText(c) }}</span>
      </div>
      <div class="rc-sides">
        <div v-for="side in [c.a, c.b]" :key="side.id" class="rc-side" :class="{ 'rc-suggest': side.id === c.suggestId }">
          <div class="rc-name">
            {{ side.customerName }}
            <n-tag size="small" :type="side.status === 'CHECKED_IN' ? 'success' : 'info'" :bordered="false">{{ side.status === 'CHECKED_IN' ? '已入住' : '预订中' }}</n-tag>
            <n-tag size="small" :type="side.priority === 'SIGNED' ? 'success' : 'default'" :bordered="false">{{ side.priority === 'SIGNED' ? '已签合同' : '仅意向' }}</n-tag>
            <n-tag v-if="side.id === c.suggestId" size="small" type="warning" :bordered="false">建议先调整这位</n-tag>
          </div>
          <div class="rc-sub">{{ day(side.plannedCheckIn) }} → {{ day(side.plannedCheckOut) }}（{{ nights(side) }} 晚）· {{ side.occupancyNo }}</div>
          <n-space style="margin-top: 8px" :size="8">
            <n-button v-if="side.status === 'RESERVED'" size="small" type="primary" secondary @click="openMove(c, side)">换到空房</n-button>
            <n-button size="small" @click="openDate(side)">改预估日期</n-button>
          </n-space>
        </div>
      </div>
    </n-card>

    <!-- 换房 -->
    <n-modal :show="!!moveTarget" @update:show="(v) => !v && (moveTarget = null)">
      <n-card v-if="moveTarget" :title="`把 ${moveTarget.side.customerName} 换到空房`" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <p class="rc-sub" style="margin: 0 0 8px">以下房间在 {{ day(moveTarget.side.plannedCheckIn) }} ~ {{ day(moveTarget.side.plannedCheckOut) }}（含整理间隔）没有别的预订，同房型的排在前面。</p>
        <n-empty v-if="freeRooms.length === 0" description="这段时间没有空房，可以试试改预估日期" />
        <n-radio-group v-else v-model:value="pickedRoom" style="width: 100%">
          <div v-for="r in freeRooms" :key="r.id" class="rc-room">
            <n-radio :value="r.id">{{ r.roomNo }}（{{ r.floor }} · {{ r.roomTypeName }}）</n-radio>
            <n-tag v-if="r.sameType" size="small" type="success" :bordered="false">同房型</n-tag>
          </div>
        </n-radio-group>
        <template #footer>
          <n-space justify="end">
            <n-button @click="moveTarget = null">取消</n-button>
            <n-button type="primary" :loading="moving" :disabled="!pickedRoom" @click="doMove">确认换房</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 改日期 -->
    <n-modal :show="!!dateTarget" @update:show="(v) => !v && (dateTarget = null)">
      <n-card v-if="dateTarget" :title="`修改 ${dateTarget.customerName} 的预估日期`" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-date-picker v-model:value="range" type="daterange" style="width: 100%" />
        <p class="rc-sub" style="margin-top: 8px">日期是预估的，改完保存即可；如果还和别的预订冲突，这里会继续提示。</p>
        <template #footer>
          <n-space justify="end">
            <n-button @click="dateTarget = null">取消</n-button>
            <n-button type="primary" :loading="rescheduling" @click="doDate">保存</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.rc-card {
  margin-bottom: 10px;
}
.rc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.rc-sub {
  color: #888;
  font-size: 12px;
}
.rc-sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.rc-side {
  padding: 8px 10px;
  border: 1px solid #eee;
  border-radius: 8px;
}
.rc-suggest {
  border-color: #f0a020;
  background: #fffaf0;
}
.rc-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 4px;
}
.rc-room {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
}
@media (max-width: 767px) {
  .rc-sides {
    grid-template-columns: 1fr;
  }
}
</style>
