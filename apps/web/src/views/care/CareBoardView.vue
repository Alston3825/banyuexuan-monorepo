<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSpace, NSelect, NDatePicker, NGrid, NGi, NCard, NEmpty, NModal, NButton } from 'naive-ui'
import { careBoardApi } from '../../api/modules/care-board.api'
import { storeApi } from '../../api/modules/store.api'
import { motherProfileApi } from '../../api/modules/care.api'
import NurseSelect from '../../components/care/NurseSelect.vue'
import { message } from '../../utils/discrete-api'
import type { CareBoardEntry } from '../../api/types/care-board'
import type { ComputedRoomStatus } from '../../api/types/room'

const router = useRouter()
const storeOptions = ref<{ label: string; value: string }[]>([])
const selectedStoreId = ref<string | null>(null)
const selectedDate = ref<number>(Date.now())

const boardEntries = ref<CareBoardEntry[]>([])
const loading = ref(false)

// 沿用房态看板的状态配色，保持全系统视觉一致（不是这个页面自己另起一套颜色）
const statusLabel: Record<ComputedRoomStatus, string> = {
  VACANT: '空闲',
  RESERVED: '预订中',
  OCCUPIED: '使用中',
  PENDING_CLEANING: '待清扫',
  MAINTENANCE: '维修中',
}

const groupedByFloor = computed(() => {
  const groups = new Map<string, CareBoardEntry[]>()
  for (const entry of boardEntries.value) {
    const list = groups.get(entry.room.floor) ?? []
    list.push(entry)
    groups.set(entry.room.floor, list)
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})

function formatMonthDay(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 入住第几天/共几天：按实际入住日期（还没入住则按预计入住日期）算到今天。 */
function stayProgress(entry: CareBoardEntry): string {
  const startIso = entry.actualCheckInAt ?? entry.plannedCheckIn
  if (!startIso || !entry.plannedCheckOut) return ''
  const start = new Date(startIso.slice(0, 10))
  const end = new Date(entry.plannedCheckOut.slice(0, 10))
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  if (entry.status !== 'OCCUPIED') return `共${totalDays}天`
  const today = new Date(new Date().toISOString().slice(0, 10))
  const dayNo = Math.min(totalDays, Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1))
  return `第${dayNo}天/共${totalDays}天`
}

const DELIVERY_LABEL: Record<string, string> = { VAGINAL: '顺', CESAREAN: '剖', UNKNOWN: '-' }
const DELIVERY_COLOR: Record<string, string> = { VAGINAL: '#7d8b63', CESAREAN: '#c96f4f', UNKNOWN: '#a8a39a' }
const GENDER_LABEL: Record<string, string> = { FEMALE: '女', MALE: '男', UNKNOWN: '-' }
const GENDER_COLOR: Record<string, string> = { FEMALE: '#b86580', MALE: '#6e97bf', UNKNOWN: '#a8a39a' }

/** 生产信息："09-20产（39+2）"——孕周不知道具体天数，天数部分暂不展示（系统目前只存整周数）。 */
function deliveryText(entry: CareBoardEntry): string {
  const c = entry.care
  if (!c || !c.deliveryDate) return '-'
  const weeks = c.gestationalWeeks != null ? `（孕${c.gestationalWeeks}周）` : ''
  return `${formatMonthDay(c.deliveryDate)}产${weeks}`
}

async function fetchStores() {
  const stores = await storeApi.list()
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  if (stores.length > 0) selectedStoreId.value = stores[0].id
}

async function fetchBoard() {
  if (!selectedStoreId.value) return
  loading.value = true
  try {
    boardEntries.value = await careBoardApi.board({ storeId: selectedStoreId.value, date: new Date(selectedDate.value).toISOString() })
  } finally {
    loading.value = false
  }
}

function openCustomer(entry: CareBoardEntry) {
  if (entry.customerId) router.push(`/crm/customers/${entry.customerId}`)
}

function openDaily(entry: CareBoardEntry) {
  if (entry.care) router.push({ path: `/care/profiles/${entry.care.motherProfileId}`, query: { tab: 'daily' } })
}

const LEVEL_TEXT: Record<string, string> = { LEVEL1: '一级（重点）', LEVEL2: '二级', LEVEL3: '三级（常规）' }
function openPlan(entry: CareBoardEntry) {
  if (entry.care) router.push({ path: `/care/profiles/${entry.care.motherProfileId}`, query: { tab: 'plans' } })
}

// 直接在卡片上指派/更换主责护理师（入住后第一时间就能分配）
const nurseForm = ref<{ entry: CareBoardEntry; nurseId: string | null } | null>(null)
const nurseSaving = ref(false)
function openNurse(entry: CareBoardEntry) {
  if (entry.care) nurseForm.value = { entry, nurseId: entry.care.nurse?.id ?? null }
}
async function saveNurse() {
  const f = nurseForm.value
  if (!f?.entry.care) return
  nurseSaving.value = true
  try {
    const mother = await motherProfileApi.get(f.entry.care.motherProfileId) // 取最新版本号，避免覆盖别人刚改的
    await motherProfileApi.update(mother.id, { primaryNurseId: f.nurseId, version: mother.version })
    message.success(f.nurseId ? '已指派护理师' : '已清除护理师')
    nurseForm.value = null
    await fetchBoard()
  } finally {
    nurseSaving.value = false
  }
}

function openArchive(entry: CareBoardEntry) {
  if (entry.care) router.push(`/care/profiles/${entry.care.motherProfileId}`)
}

onMounted(async () => {
  await fetchStores()
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
      <h3 class="bx-serif" style="margin: 0 0 10px; font-size: 18px">{{ floor }}</h3>
      <n-grid :x-gap="12" :y-gap="12" :cols="6" responsive="screen" :item-responsive="true">
        <n-gi v-for="entry in entries" :key="entry.room.id" span="6 m:3 l:2 xl:1">
          <n-card :class="['bx-rc', `bx-rc--${entry.status}`]" size="small" content-style="padding: 8px 10px">
            <div class="bx-rc-head">
              <span class="bx-rc-no">{{ entry.room.roomNo }}</span>
              <span class="bx-rc-type">{{ entry.room.roomType?.name }}</span>
              <span class="bx-rc-pill">{{ statusLabel[entry.status] }}</span>
            </div>

            <template v-if="entry.occupancyId">
              <div class="cb-row">
                <span class="cb-label">客户：</span>
                <a v-if="entry.customerName" class="cb-customer" @click="openCustomer(entry)">{{ entry.customerName }}</a>
              </div>
              <div v-if="entry.care" class="cb-row">
                <span class="cb-label">护理师：</span>
                <a v-if="entry.care.nurse" class="cb-nurse" title="点击更换" @click="openNurse(entry)">{{ entry.care.nurse.name }}</a>
                <a v-else class="cb-daily cb-daily-no" @click="openNurse(entry)">未指派，去指派</a>
              </div>
              <div class="cb-row"><span class="cb-label">住店：</span>{{ formatMonthDay(entry.actualCheckInAt ?? entry.plannedCheckIn) }} ~ {{ formatMonthDay(entry.plannedCheckOut) }}（{{ stayProgress(entry) }}）</div>
              <!-- 医嘱/生产 只有已建母婴档案（真正办理过入住登记）的入住才有，没有就不硬凑一行 -->
              <template v-if="entry.care">
                <div class="cb-row">
                  <span class="cb-label">护理等级：</span>
                  <template v-if="entry.care.plan"><b>{{ LEVEL_TEXT[entry.care.plan.level] ?? entry.care.plan.level }}</b><span v-if="entry.care.plan.reviewOverdue" class="cb-over">　评审已到期</span></template>
                  <a v-else class="cb-daily cb-daily-no" @click="openPlan(entry)">未制定，去制定</a>
                </div>
                <div class="cb-row"><span class="cb-label">医嘱：</span>{{ entry.care.careNote || entry.care.plan?.focusPoints || '无' }}</div>
                <div v-if="entry.care.hasAllergyTag" class="cb-row">
                  <span class="cb-label">过敏：</span><span class="cb-allergy">{{ entry.care.allergyNote ?? '有（详见入所评估/风险标签）' }}</span>
                </div>
                <div class="cb-row"><span class="cb-label">生产：</span>{{ deliveryText(entry) }}</div>
                <div class="cb-row">
                  <span class="cb-label">今日记录：</span>
                  <a class="cb-daily" :class="entry.care.dailyFilledToday ? 'cb-daily-ok' : 'cb-daily-no'" @click="openDaily(entry)">{{ entry.care.dailyFilledToday ? '已填' : '未填，去填写' }}</a>
                </div>
              </template>

              <div class="cb-btns">
                <!-- 点进这位客户的母婴档案（客户 + 宝宝的全部护理档案都归在母婴档案下）；还没建母婴档案时置灰 -->
                <button class="cb-btn" :disabled="!entry.care" :title="entry.care ? '' : '这次入住还没有建母婴档案'" @click="openArchive(entry)">母婴档案</button>
              </div>

              <div class="cb-foot">
                <!-- 投诉模块还没做，先固定显示"无投诉" -->
                <span class="cb-complaint">👍 无投诉</span>
                <span class="cb-badges">
                  <span class="cb-badge" :style="{ background: DELIVERY_COLOR[entry.care?.deliveryMethod ?? 'UNKNOWN'] }">
                    {{ DELIVERY_LABEL[entry.care?.deliveryMethod ?? 'UNKNOWN'] }}
                  </span>
                  <template v-if="entry.care && entry.care.babies.length > 0">
                    <span v-for="baby in entry.care.babies" :key="baby.id" class="cb-badge" :style="{ background: GENDER_COLOR[baby.gender] }">
                      {{ GENDER_LABEL[baby.gender] }}
                    </span>
                  </template>
                  <span v-else class="cb-badge" style="background: #a8a39a">-</span>
                  <span class="cb-badge" :style="{ background: entry.care?.hasAllergyTag ? '#b4533a' : '#a8a39a' }" :title="entry.care?.hasAllergyTag ? `过敏：${entry.care.allergyNote ?? '有'}` : '无过敏记录'">敏</span>
                </span>
              </div>
            </template>
          </n-card>
        </n-gi>
      </n-grid>
    </div>
    <n-modal :show="!!nurseForm" @update:show="(v) => !v && (nurseForm = null)">
      <n-card v-if="nurseForm" :title="`指派护理师：${nurseForm.entry.room.roomNo} ${nurseForm.entry.customerName ?? ''}`" style="width: min(420px, 94vw)" :bordered="false" role="dialog" closable @close="nurseForm = null" aria-modal="true">
        <nurse-select v-model="nurseForm.nurseId" :store-id="selectedStoreId ?? undefined" />
        <div style="margin-top: 8px; color: #86817a; font-size: 12px">护理师从员工账号里选；换人后以最新指派为准，历史记录里的签字不受影响。</div>
        <template #footer>
          <n-space justify="end"><n-button @click="nurseForm = null">取消</n-button><n-button type="primary" :loading="nurseSaving" @click="saveNurse">保存</n-button></n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.cb-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.cb-no {
  font-size: 17px;
  font-weight: 600;
  color: #161615;
}
.cb-type {
  font-size: 12px;
  color: #6f6a62;
}
.cb-pill {
  margin-left: auto;
  font-size: 11px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  white-space: nowrap;
}
.cb-row {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: #3b3a37;
}
.cb-label {
  color: #86817a;
}
.cb-customer {
  color: #161615;
  font-size: 14px;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: #c96f4f;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  cursor: pointer;
}
.cb-nurse {
  color: #161615;
  text-decoration: underline dotted #86817a;
  text-underline-offset: 3px;
  font-weight: 600;
  cursor: pointer;
}
.cb-allergy {
  color: #b4533a;
  font-weight: 600;
}
.cb-over {
  color: #b4533a;
  font-weight: 600;
}
.cb-daily {
  font-weight: 600;
  cursor: pointer;
}
.cb-daily-ok {
  color: #5f6b49;
}
.cb-daily-no {
  color: #c96f4f;
  text-decoration: underline;
}
.cb-btns {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
}
.cb-btn {
  flex: 0 0 calc(50% - 3px); /* 只有一个“母婴档案”按钮，宽度取原来整行的一半 */
  border: none;
  border-radius: 6px;
  background: #161615;
  color: #f7f5ef;
  font-size: 11px;
  line-height: 26px;
  cursor: pointer;
}
.cb-btn:disabled {
  cursor: not-allowed;
  background: transparent;
  color: #a8a39a;
  box-shadow: inset 0 0 0 1px #d6d2c8;
}
.cb-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #6f6a62;
}
.cb-badges {
  display: flex;
  gap: 4px;
}
.cb-badge {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
