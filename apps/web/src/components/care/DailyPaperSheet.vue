<script setup lang="ts">
/**
 * 日常护理记录的“纸质单版式”：和《新生儿日常护理记录》+“产妇日常护理”那张纸一样的排版——
 *   ┌ 表头：房号 / 妈妈姓名 / 入住天数 / 出生天数 / 宝宝体重 / 日期
 *   ├ 体征（眼口鼻脐带生殖器皮肤）            │ 健康评估、体温（早/晚）
 *   ├ 24 小时宝宝喂养记录单（左，一整张表）    │ 白班护理总结+签字 / 夜班护理总结+签字（右）
 *   └ 产妇日常护理：乳房 / 伤口 / 恶露 / 护理计划 / 签字
 * 电脑端按纸的样子排；手机（<768px）自动改成上下排列、喂养记录用卡片行，免得左右拖动。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DailyDay, DailySpecs, ExtractWarning, FeedingEntry, FieldSpec } from '../../api/types/care-archive'
import FeedingGrid from './FeedingGrid.vue'
import FeedingTable from './FeedingTable.vue'
import PaperField from './PaperField.vue'

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

// 窄屏判断（手机）
const narrow = ref(false)
let mq: MediaQueryList | null = null
const onMq = () => (narrow.value = !!mq?.matches)
onMounted(() => {
  mq = window.matchMedia('(max-width: 767px)')
  onMq()
  mq.addEventListener('change', onMq)
})
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))

// 说明书里缺了某个字段（比如前后端版本不一致）时，用一个普通文本框顶上，别让整页渲染报错白屏
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

const avg = (id: string) => {
  const v = props.babyStates[id].values
  const nums = ['jaundiceForehead', 'jaundiceCanthus', 'jaundiceChest'].map((k) => v[k]).filter((x): x is number => typeof x === 'number')
  return nums.length ? String(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10) : '-'
}
const dateText = computed(() => {
  const [, m, d] = props.date.split('-')
  return `${Number(m)}.${Number(d)}`
})
</script>

<template>
  <div class="ps">
    <!-- ============ 宝宝：新生儿日常护理记录（每个宝宝一张） ============ -->
    <section v-for="b in day.babies" :id="`dr-baby-${b.baby.id}`" :key="b.baby.id" class="ps-paper">
      <div class="ps-title">新生儿日常护理记录<small>{{ babyLabel(b.baby.id) }}</small><span class="ps-date">日期：{{ dateText }}</span></div>

      <!-- 表头一行 -->
      <div class="ps-row ps-head">
        <div class="ps-cell"><span class="ps-k">房号</span><b>{{ day.roomNo ?? '-' }}</b></div>
        <div class="ps-cell"><span class="ps-k">妈妈姓名</span><b>{{ day.motherName ?? '-' }}</b></div>
        <div class="ps-cell"><span class="ps-k">入住天数</span><b>{{ day.record?.stayDay ?? day.defaults.stayDay }}</b></div>
        <div class="ps-cell"><PaperField :field="bf.ageDays" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'ageDays')" width="44px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" /></div>
        <div class="ps-cell"><PaperField :field="bf.weightKg" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'weightKg')" width="58px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" /></div>
        <div class="ps-cell"><PaperField :field="bf.lengthCm" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'lengthCm')" width="52px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" /></div>
        <div class="ps-cell"><PaperField :field="bf.headCm" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'headCm')" width="52px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" /></div>
      </div>

      <!-- 体征 + 健康评估/体温 -->
      <div class="ps-row ps-signs">
        <div class="ps-signbox">
          <span class="ps-side">体征</span>
          <div class="ps-signgrid">
            <PaperField v-for="k in ['eye', 'nose', 'genitalia', 'mouth', 'umbilical', 'skin']" :key="k" :field="bf[k]" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, k)" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
          </div>
        </div>
        <div class="ps-health">
          <PaperField :field="bf.healthAssessment" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'healthAssessment')" width="150px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
          <div class="ps-temps">
            <PaperField :field="bf.tempMorning" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'tempMorning')" width="48px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            <PaperField :field="bf.tempEvening" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'tempEvening')" width="48px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
          </div>
          <div class="ps-jaun">
            <span class="ps-k">黄疸</span>
            <PaperField :field="bf.jaundiceForehead" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'jaundiceForehead')" width="40px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            <PaperField :field="bf.jaundiceCanthus" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'jaundiceCanthus')" width="40px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            <PaperField :field="bf.jaundiceChest" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'jaundiceChest')" width="40px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            <span class="ps-sub">前额·眼角·前胸，平均 {{ avg(b.baby.id) }}</span>
          </div>
        </div>
      </div>

      <!-- 喂养记录单（左）+ 班次总结（右） -->
      <div class="ps-main">
        <div class="ps-left">
          <div class="ps-cap">24 小时宝宝喂养记录单</div>
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
          <div class="ps-plan"><PaperField :field="bf.babyPlan" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'babyPlan')" :rows="2" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" /></div>
        </div>
        <div class="ps-right">
          <div class="ps-shift">
            <div class="ps-cap">白班护理总结</div>
            <PaperField :field="bf.dayShiftSummary" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'dayShiftSummary')" :rows="6" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            <div class="ps-sign">
              <PaperField :field="bf.dayNurseName" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'dayNurseName')" width="90px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
              <PaperField :field="bf.babyClientSigner" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'babyClientSigner')" width="90px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            </div>
          </div>
          <div class="ps-shift">
            <div class="ps-cap">夜班护理总结</div>
            <PaperField :field="bf.nightShiftSummary" no-label :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'nightShiftSummary')" :rows="6" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            <div class="ps-sign">
              <PaperField :field="bf.nightNurseName" :model-value="babyStates[b.baby.id].values" :warn="warnFor(b.baby.id, 'nightNurseName')" width="90px" @update:model-value="(v) => setBaby(b.baby.id, { values: v })" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 产妇日常护理 ============ -->
    <section id="dr-mother" class="ps-paper">
      <div class="ps-title">产妇日常护理</div>
      <div class="ps-mrow"><span class="ps-side">乳房</span>
        <PaperField :field="mf.breast" :model-value="motherValues" :warn="warnMap.breast" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.breastBody" :model-value="motherValues" :warn="warnMap.breastBody" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.milk" :model-value="motherValues" :warn="warnMap.milk" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.motherTemperature" :model-value="motherValues" :warn="warnMap.motherTemperature" width="50px" @update:model-value="(v) => emit('update:motherValues', v)" />
      </div>
      <div class="ps-mrow"><span class="ps-side">伤口</span>
        <PaperField :field="mf.woundCesarean" :model-value="motherValues" :warn="warnMap.woundCesarean" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.woundVaginal" :model-value="motherValues" :warn="warnMap.woundVaginal" @update:model-value="(v) => emit('update:motherValues', v)" />
      </div>
      <div class="ps-mrow"><span class="ps-side">恶露</span>
        <PaperField :field="mf.lochiaStatus" :model-value="motherValues" :warn="warnMap.lochiaStatus" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.lochiaColor" :model-value="motherValues" :warn="warnMap.lochiaColor" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.lochiaAmount" :model-value="motherValues" :warn="warnMap.lochiaAmount" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.lochiaOdor" :model-value="motherValues" :warn="warnMap.lochiaOdor" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.bowel" :model-value="motherValues" :warn="warnMap.bowel" width="70px" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.urine" :model-value="motherValues" :warn="warnMap.urine" width="70px" @update:model-value="(v) => emit('update:motherValues', v)" />
      </div>
      <div class="ps-mrow"><span class="ps-side">生命体征</span>
        <PaperField :field="mf.motherPulse" :model-value="motherValues" :warn="warnMap.motherPulse" width="50px" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.motherBpSystolic" :model-value="motherValues" :warn="warnMap.motherBpSystolic" width="50px" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.motherBpDiastolic" :model-value="motherValues" :warn="warnMap.motherBpDiastolic" width="50px" @update:model-value="(v) => emit('update:motherValues', v)" />
        <span class="ps-sub">（纸上没有专门栏，常手写在边上）</span>
      </div>
      <div class="ps-mrow ps-mplan"><span class="ps-side">护理计划</span>
        <div class="ps-grow"><PaperField :field="mf.motherPlan" no-label :model-value="motherValues" :warn="warnMap.motherPlan" :rows="2" @update:model-value="(v) => emit('update:motherValues', v)" /></div>
        <PaperField :field="mf.motherNurseName" :model-value="motherValues" :warn="warnMap.motherNurseName" width="90px" @update:model-value="(v) => emit('update:motherValues', v)" />
        <PaperField :field="mf.motherClientSigner" :model-value="motherValues" :warn="warnMap.motherClientSigner" width="90px" @update:model-value="(v) => emit('update:motherValues', v)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.ps-paper {
  margin-top: 12px;
  border: 1.5px solid #6b6b6b;
  border-radius: 2px;
  background: #fff;
  scroll-margin-top: 8px;
}
.ps-title {
  position: relative;
  padding: 6px 10px;
  border-bottom: 1px solid #6b6b6b;
  background: #f6f6f6;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
}
.ps-title small {
  margin-left: 10px;
  font-size: 12px;
  font-weight: 400;
  color: #888;
  letter-spacing: 0;
}
.ps-date {
  position: absolute;
  right: 10px;
  top: 8px;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
}
.ps-row {
  display: flex;
  border-bottom: 1px solid #9a9a9a;
}
.ps-head {
  flex-wrap: wrap;
}
.ps-cell {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 2px 8px;
  border-right: 1px solid #9a9a9a;
  font-size: 13px;
  white-space: nowrap;
}
.ps-cell:last-child {
  border-right: 0;
}
.ps-k {
  color: #555;
}
.ps-signs {
  align-items: stretch;
}
.ps-signbox {
  flex: 1 1 62%;
  display: flex;
  border-right: 1px solid #9a9a9a;
}
.ps-side {
  flex: 0 0 auto;
  width: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-right: 1px solid #9a9a9a;
  background: #f6f6f6;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}
.ps-signgrid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 4px;
  padding: 3px 6px;
  align-content: center;
}
.ps-health {
  flex: 1 1 38%;
  padding: 3px 8px;
}
.ps-temps,
.ps-jaun {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 8px;
}
.ps-sub {
  color: #999;
  font-size: 11px;
}
.ps-main {
  display: flex;
  align-items: stretch;
}
.ps-left {
  flex: 1 1 0;
  min-width: 0;
  padding: 6px 8px;
  border-right: 1px solid #9a9a9a;
}
.ps-right {
  flex: 0 0 270px;
  display: flex;
  flex-direction: column;
}
.ps-shift {
  flex: 1;
  padding: 6px 8px;
}
.ps-shift + .ps-shift {
  border-top: 1px solid #9a9a9a;
}
.ps-cap {
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #333;
}
.ps-sign {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
  margin-top: 4px;
}
.ps-plan {
  margin-top: 6px;
}
.ps-mrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 14px;
  padding: 3px 10px 3px 0;
  border-bottom: 1px solid #9a9a9a;
  min-height: 34px;
}
.ps-mrow:last-child {
  border-bottom: 0;
}
.ps-mrow .ps-side {
  align-self: stretch;
  width: 60px;
  margin-right: -4px;
}
.ps-grow {
  flex: 1 1 260px;
}
@media (max-width: 767px) {
  .ps-date {
    position: static;
    display: block;
    margin-top: 2px;
  }
  .ps-head .ps-cell {
    flex: 1 1 45%;
    border-bottom: 1px solid #ddd;
  }
  .ps-signs,
  .ps-main {
    flex-direction: column;
  }
  .ps-signbox {
    border-right: 0;
    border-bottom: 1px solid #9a9a9a;
  }
  .ps-signgrid {
    grid-template-columns: 1fr;
  }
  .ps-left {
    border-right: 0;
    border-bottom: 1px solid #9a9a9a;
  }
  .ps-right {
    flex-basis: auto;
  }
  .ps-mrow {
    padding-left: 0;
  }
  .ps-mrow .ps-side {
    width: 100%;
    margin-right: 0;
    border-right: 0;
    border-bottom: 1px solid #ddd;
    justify-content: flex-start;
    padding-left: 8px;
  }
}
</style>
