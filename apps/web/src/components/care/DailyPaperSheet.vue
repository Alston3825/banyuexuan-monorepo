<script setup lang="ts">
/**
 * 日常护理记录页（一张纸 = 一页）：
 *  电脑端（≥768px）：左右两栏——左边是宝宝（基本与体温、体征、24 小时喂养记录表），右边是班次总结与签字、产妇日常护理；
 *  手机端：每一块是一张可折叠的卡片，折叠时只显示一行摘要（已填多少/关键数字），点开才填；
 *  拍一次整张记录单，宝宝和妈妈一起预填。喂养记录电脑端是表格，手机端是卡片行（避免左右拖动）。
 */
import { computed, reactive, watch } from 'vue'
import type { DailyDay, DailySpecs, ExtractWarning, FeedingEntry, FieldSpec } from '../../api/types/care-archive'
import { useNarrow } from '../../composables/useNarrow'
import FeedingGrid from './FeedingGrid.vue'
import FeedingTable from './FeedingTable.vue'
import PaperField from './PaperField.vue'
import SheetSection from './SheetSection.vue'

type BabyState = { values: Record<string, unknown>; feedings: FeedingEntry[] }

const props = defineProps<{
  specs: DailySpecs
  day: DailyDay
  date: string
  nurse: string
  babyStates: Record<string, BabyState>
  motherValues: Record<string, unknown>
  warnings: ExtractWarning[]
  aiBabyId: string | null
  babyLabel: (id: string) => string
}>()
const emit = defineEmits<{ 'update:babyStates': [value: Record<string, BabyState>]; 'update:motherValues': [value: Record<string, unknown>] }>()

// 手机判断（<768px）：折叠卡片 + 卡片行
const narrow = useNarrow()

// 说明书里缺了某个字段（前后端版本不一致）时，用普通文本框顶上，别让整页渲染报错
const flat = (groups: { fields: FieldSpec[] }[]) => {
  const map = Object.fromEntries(groups.flatMap((g) => g.fields).map((f) => [f.key, f])) as Record<string, FieldSpec>
  return new Proxy(map, { get: (t, k) => t[k as string] ?? ({ key: String(k), label: String(k), kind: 'text' } as FieldSpec) })
}
const bf = computed(() => flat(props.specs.baby))
const mf = computed(() => flat(props.specs.mother))

const warnMap = computed(() => {
  const m: Record<string, string> = {}
  for (const w of props.warnings) if (w.level !== 'info' && !w.field.includes('.')) m[w.field] = w.message
  return m
})
const warnFor = (babyId: string, key: string) => (props.aiBabyId === babyId ? warnMap.value[key] : undefined)

function setBaby(id: string, patch: Partial<BabyState>) {
  emit('update:babyStates', { ...props.babyStates, [id]: { ...props.babyStates[id], ...patch } })
}
const setValues = (id: string) => (v: Record<string, unknown>) => setBaby(id, { values: v })
const setMother = (v: Record<string, unknown>) => emit('update:motherValues', v)

// ---------- 折叠状态（只在手机上起作用） ----------
const open = reactive<Record<string, boolean>>({})
const isOpen = (k: string) => open[k] ?? k.endsWith(':basic')
const toggle = (k: string) => (open[k] = !isOpen(k))
// 识别完成后全部展开，方便逐块核对
watch(
  () => props.aiBabyId,
  (id) => {
    if (!id) return
    for (const b of props.day.babies) for (const s of ['basic', 'signs', 'feed', 'shift']) open[`${b.baby.id}:${s}`] = true
    open.mother = true
  },
)

// ---------- 摘要 ----------
const has = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
const countFilled = (vals: Record<string, unknown>, keys: string[]) => keys.filter((k) => has(vals[k])).length
const BASIC_KEYS = ['ageDays', 'weightG', 'lengthCm', 'headCm', 'tempMorning', 'tempEvening']
const SIGN_KEYS = ['eye', 'mouth', 'nose', 'umbilical', 'genitalia', 'skin']
const SHIFT_KEYS = ['dayShiftSummary', 'dayNurseName', 'nightShiftSummary', 'nightNurseName', 'babyClientSigner']
const MOTHER_KEYS = ['breast', 'breastBody', 'milk', 'woundCesarean', 'woundVaginal', 'lochiaStatus', 'lochiaColor', 'lochiaAmount', 'lochiaOdor', 'motherTemperature', 'motherBpSystolic', 'motherBpDiastolic', 'motherPlan', 'motherNurseName']

function basicSummary(id: string) {
  const v = props.babyStates[id].values
  const parts: string[] = []
  if (has(v.weightG)) parts.push(`${v.weightG}g`)
  if (has(v.tempMorning) || has(v.tempEvening)) parts.push(`${v.tempMorning ?? '-'}/${v.tempEvening ?? '-'}℃`)
  return parts.length ? parts.join(' · ') : '还没填'
}
function signSummary(id: string) {
  const v = props.babyStates[id].values
  const labels: string[] = []
  for (const k of SIGN_KEYS) {
    const sel = Array.isArray(v[k]) ? (v[k] as string[]) : []
    const f = bf.value[k]
    for (const code of sel) labels.push(`${f.label}${f.options?.find((o) => o.value === code)?.label ?? code}`)
  }
  return labels.length ? labels.join('、') : '无异常'
}
function feedSummary(id: string) {
  const rows = props.babyStates[id].feedings
  if (!rows.length) return '还没记录'
  const sum = (k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  return `${rows.length} 次 · 奶粉 ${sum('formulaMl')}ml · 尿 ${rows.filter((r) => r.urine === 'YES').length} · 便 ${rows.filter((r) => r.stool === 'YES').length}`
}
const stateOf = (n: number): 'empty' | 'done' => (n > 0 ? 'done' : 'empty')
const motherFilled = computed(() => countFilled(props.motherValues, MOTHER_KEYS))
const motherSummary = computed(() => (motherFilled.value ? `已填 ${motherFilled.value}/${MOTHER_KEYS.length}` : '还没填'))

function allNormal(id: string) {
  const patch: Record<string, unknown> = {}
  for (const k of SIGN_KEYS) patch[k] = []
  setBaby(id, { values: { ...props.babyStates[id].values, ...patch } })
}
const avg = (id: string) => {
  const v = props.babyStates[id].values
  const nums = ['jaundiceForehead', 'jaundiceCanthus', 'jaundiceChest'].map((k) => v[k]).filter((x): x is number => typeof x === 'number')
  return nums.length ? String(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10) : '-'
}
const dateText = computed(() => {
  const [, m, d] = props.date.split('-')
  return `${Number(m)}月${Number(d)}日`
})
const stay = computed(() => props.day.record?.stayDay ?? props.day.defaults.stayDay)
</script>

<template>
  <div class="ps" :class="{ 'ps-narrow': narrow }">
    <div class="ps-info">房号 <b>{{ day.roomNo ?? '-' }}</b> · 妈妈 <b>{{ day.motherName ?? '-' }}</b> · 入住第 <b>{{ stay }}</b> 天 · {{ dateText }}</div>

    <div class="ps-grid">
      <!-- ============ 左栏：宝宝 ============ -->
      <div class="ps-col">
        <div v-for="b in day.babies" :id="`dr-baby-${b.baby.id}`" :key="b.baby.id" class="ps-baby">
          <div class="ps-babytitle">👶 {{ babyLabel(b.baby.id) }}</div>

          <SheetSection title="基本与体温" :summary="basicSummary(b.baby.id)" :state="stateOf(countFilled(babyStates[b.baby.id].values, BASIC_KEYS))" :open="isOpen(`${b.baby.id}:basic`)" :collapsible="narrow" @toggle="toggle(`${b.baby.id}:basic`)">
            <div class="ps-line">
              <PaperField :field="bf.ageDays" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'ageDays')" width="44px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.weightG" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'weightG')" width="62px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.lengthCm" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'lengthCm')" width="52px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.headCm" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'headCm')" width="52px" @update:model-value="setValues(b.baby.id)" />
            </div>
            <div class="ps-line">
              <PaperField :field="bf.tempMorning" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'tempMorning')" width="52px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.tempEvening" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'tempEvening')" width="52px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.healthAssessment" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'healthAssessment')" width="130px" @update:model-value="setValues(b.baby.id)" />
            </div>
            <div class="ps-line">
              <span class="ps-k">黄疸</span>
              <PaperField :field="bf.jaundiceForehead" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'jaundiceForehead')" width="40px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.jaundiceCanthus" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'jaundiceCanthus')" width="40px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.jaundiceChest" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'jaundiceChest')" width="40px" @update:model-value="setValues(b.baby.id)" />
              <span class="ps-sub">前额·眼角·前胸，平均 {{ avg(b.baby.id) }}</span>
            </div>
          </SheetSection>

          <SheetSection title="体征" :summary="signSummary(b.baby.id)" state="done" :open="isOpen(`${b.baby.id}:signs`)" :collapsible="narrow" @toggle="toggle(`${b.baby.id}:signs`)">
            <div class="ps-signtop"><button type="button" class="ps-btn" @click="allNormal(b.baby.id)">全部无异常</button><span class="ps-sub">不勾 = 无异常；有异常的点一下选中</span></div>
            <div class="ps-signgrid">
              <PaperField v-for="k in SIGN_KEYS" :key="k" part :field="bf[k]" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, k)" @update:model-value="setValues(b.baby.id)" />
            </div>
          </SheetSection>

          <SheetSection title="24 小时喂养记录" :summary="feedSummary(b.baby.id)" :state="stateOf(babyStates[b.baby.id].feedings.length)" :open="isOpen(`${b.baby.id}:feed`)" :collapsible="narrow" @toggle="toggle(`${b.baby.id}:feed`)">
            <FeedingTable
              v-if="narrow"
              :model-value="babyStates[b.baby.id].feedings"
              :columns="specs.feeding"
              :warnings="aiBabyId === b.baby.id ? warnings : []"
              :default-nurse="nurse"
              :active-medications="b.activeMedications"
              @update:model-value="(v) => setBaby(b.baby.id, { feedings: v })"
            />
            <FeedingGrid
              v-else
              :model-value="babyStates[b.baby.id].feedings"
              :columns="specs.feeding"
              :warnings="aiBabyId === b.baby.id ? warnings : []"
              :default-nurse="nurse"
              :active-medications="b.activeMedications"
              @update:model-value="(v) => setBaby(b.baby.id, { feedings: v })"
            />
            <div class="ps-plan"><PaperField :field="bf.babyPlan" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'babyPlan')" :rows="2" @update:model-value="setValues(b.baby.id)" /></div>
          </SheetSection>

          <!-- 手机上班次总结跟在宝宝后面；电脑端放右栏 -->
          <SheetSection v-if="narrow" title="班次总结与签字" :summary="`已填 ${countFilled(babyStates[b.baby.id].values, SHIFT_KEYS)}/${SHIFT_KEYS.length}`" :state="stateOf(countFilled(babyStates[b.baby.id].values, SHIFT_KEYS))" :open="isOpen(`${b.baby.id}:shift`)" :collapsible="true" @toggle="toggle(`${b.baby.id}:shift`)">
            <div class="ps-cap">白班护理总结</div>
            <PaperField :field="bf.dayShiftSummary" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'dayShiftSummary')" :rows="4" @update:model-value="setValues(b.baby.id)" />
            <div class="ps-line">
              <PaperField :field="bf.dayNurseName" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'dayNurseName')" width="90px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.babyClientSigner" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'babyClientSigner')" width="90px" @update:model-value="setValues(b.baby.id)" />
            </div>
            <div class="ps-cap">夜班护理总结</div>
            <PaperField :field="bf.nightShiftSummary" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'nightShiftSummary')" :rows="4" @update:model-value="setValues(b.baby.id)" />
            <div class="ps-line"><PaperField :field="bf.nightNurseName" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'nightNurseName')" width="90px" @update:model-value="setValues(b.baby.id)" /></div>
          </SheetSection>
        </div>
      </div>

      <!-- ============ 右栏（电脑端）：班次总结 + 产妇 ============ -->
      <div class="ps-col">
        <template v-if="!narrow">
          <SheetSection v-for="b in day.babies" :key="`sh-${b.baby.id}`" :title="`班次总结与签字${day.babies.length > 1 ? '：' + babyLabel(b.baby.id) : ''}`" :summary="`已填 ${countFilled(babyStates[b.baby.id].values, SHIFT_KEYS)}/${SHIFT_KEYS.length}`" :state="stateOf(countFilled(babyStates[b.baby.id].values, SHIFT_KEYS))" :open="true" :collapsible="false">
            <div class="ps-cap">白班护理总结</div>
            <PaperField :field="bf.dayShiftSummary" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'dayShiftSummary')" :rows="3" @update:model-value="setValues(b.baby.id)" />
            <div class="ps-line">
              <PaperField :field="bf.dayNurseName" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'dayNurseName')" width="80px" @update:model-value="setValues(b.baby.id)" />
              <PaperField :field="bf.babyClientSigner" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'babyClientSigner')" width="80px" @update:model-value="setValues(b.baby.id)" />
            </div>
            <div class="ps-cap">夜班护理总结</div>
            <PaperField :field="bf.nightShiftSummary" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'nightShiftSummary')" :rows="3" @update:model-value="setValues(b.baby.id)" />
            <div class="ps-line"><PaperField :field="bf.nightNurseName" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'nightNurseName')" width="80px" @update:model-value="setValues(b.baby.id)" /></div>
          </SheetSection>
        </template>

        <div id="dr-mother">
          <SheetSection title="🤱 产妇日常护理" :summary="motherSummary" :state="stateOf(motherFilled)" :open="isOpen('mother')" :collapsible="narrow" @toggle="toggle('mother')">
            <div class="ps-gh">乳房</div>
            <PaperField part :field="mf.breast" :model-value="motherValues" :warn="warnMap.breast" @update:model-value="setMother" />
            <PaperField part :field="mf.breastBody" :model-value="motherValues" :warn="warnMap.breastBody" @update:model-value="setMother" />
            <PaperField part :field="mf.milk" :model-value="motherValues" :warn="warnMap.milk" @update:model-value="setMother" />

            <div class="ps-gh">伤口</div>
            <PaperField part :field="mf.woundCesarean" :model-value="motherValues" :warn="warnMap.woundCesarean" @update:model-value="setMother" />
            <PaperField part :field="mf.woundVaginal" :model-value="motherValues" :warn="warnMap.woundVaginal" @update:model-value="setMother" />

            <div class="ps-gh">恶露与二便</div>
            <PaperField part :field="mf.lochiaStatus" :model-value="motherValues" :warn="warnMap.lochiaStatus" @update:model-value="setMother" />
            <PaperField part :field="mf.lochiaColor" :model-value="motherValues" :warn="warnMap.lochiaColor" @update:model-value="setMother" />
            <PaperField part :field="mf.lochiaAmount" :model-value="motherValues" :warn="warnMap.lochiaAmount" @update:model-value="setMother" />
            <PaperField part :field="mf.lochiaOdor" :model-value="motherValues" :warn="warnMap.lochiaOdor" @update:model-value="setMother" />
            <div class="ps-line">
              <PaperField :field="mf.bowel" :model-value="motherValues" :warn="warnMap.bowel" width="70px" @update:model-value="setMother" />
              <PaperField :field="mf.urine" :model-value="motherValues" :warn="warnMap.urine" width="70px" @update:model-value="setMother" />
            </div>

            <div class="ps-gh">体温血压</div>
            <div class="ps-line">
              <PaperField :field="mf.motherTemperature" :model-value="motherValues" :warn="warnMap.motherTemperature" width="48px" @update:model-value="setMother" />
              <PaperField :field="mf.motherPulse" :model-value="motherValues" :warn="warnMap.motherPulse" width="48px" @update:model-value="setMother" />
              <PaperField :field="mf.motherBpSystolic" :model-value="motherValues" :warn="warnMap.motherBpSystolic" width="48px" @update:model-value="setMother" />
              <PaperField :field="mf.motherBpDiastolic" :model-value="motherValues" :warn="warnMap.motherBpDiastolic" width="48px" @update:model-value="setMother" />
            </div>

            <div class="ps-gh">护理计划与签字</div>
            <PaperField :field="mf.motherPlan" no-label :model-value="motherValues" :warn="warnMap.motherPlan" :rows="2" @update:model-value="setMother" />
            <div class="ps-line">
              <PaperField :field="mf.motherNurseName" :model-value="motherValues" :warn="warnMap.motherNurseName" width="80px" @update:model-value="setMother" />
              <PaperField :field="mf.motherClientSigner" :model-value="motherValues" :warn="warnMap.motherClientSigner" width="80px" @update:model-value="setMother" />
            </div>
          </SheetSection>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ps-info {
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #eef5fc;
  font-size: 13px;
  color: #355;
}
.ps-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  margin-top: 10px;
}
.ps-col {
  min-width: 0;
}
.ps-babytitle {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
}
.ps-baby + .ps-baby {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 2px dashed #ddd;
}
.ps-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  margin-bottom: 4px;
}
.ps-k {
  font-size: 13px;
}
.ps-sub {
  color: #999;
  font-size: 11px;
}
.ps-signtop {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.ps-btn {
  padding: 2px 10px;
  border: 1px solid #18a058;
  border-radius: 6px;
  background: #fff;
  color: #0c7a43;
  font-size: 13px;
  cursor: pointer;
}
.ps-signgrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 14px;
}
.ps-plan {
  margin-top: 6px;
}
.ps-cap {
  margin: 4px 0 3px;
  font-size: 13px;
  font-weight: 700;
}
.ps-gh {
  margin: 8px 0 2px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #eef3fa;
  color: #2a64b0;
  font-size: 13px;
  font-weight: 700;
}
.ps-gh:first-child {
  margin-top: 0;
}
.ps-mrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 12px;
  padding: 3px 0;
  border-bottom: 1px dashed #e4e4e4;
}
.ps-mrow:last-child {
  border-bottom: 0;
}
.ps-side {
  flex: 0 0 34px;
  font-size: 13px;
  font-weight: 700;
  color: #555;
}
.ps-grow {
  flex: 1 1 200px;
  min-width: 0;
}

/* ---------- 手机 ---------- */
@media (max-width: 767px) {
  .ps-grid {
    display: block;
  }
  .ps-signgrid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .ps-mrow {
    gap: 4px 10px;
    padding: 6px 0;
  }
  .ps-side {
    flex-basis: 100%;
  }
  .ps-btn {
    padding: 8px 14px;
    font-size: 14px;
  }
}
</style>
