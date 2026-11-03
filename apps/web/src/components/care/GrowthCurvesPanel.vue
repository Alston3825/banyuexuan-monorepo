<script setup lang="ts">
/**
 * 母婴档案里的“生长曲线”：定期记录宝宝的体重、身长、头围，和国家标准（WS/T 423—2022）的 P3~P97 对比，
 * 生成曲线图。可以“生成客户链接”（客户手机打开看，随记录更新）或“下载图片”（微信里直接发）。
 * 日常护理记录里记的体重会自动并入曲线，不用重复录；身长、头围在这里记。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDatePicker, NEmpty, NInput, NInputNumber, NModal, NRadioButton, NRadioGroup, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { careGrowthApi } from '../../api/modules/care-growth.api'
import type { GrowthReport, GrowthStandard } from '../../api/types/care-growth'
import { buildGrowthSvg, downloadSvgAsPng } from '../../utils/growth-chart'
import { dialog, message } from '../../utils/discrete-api'
import { useAuthStore } from '../../stores/auth'
import type { GrowthTableRow } from '../../api/types/care-growth'

const props = defineProps<{ babies: { id: string; sequenceNo: number; name: string | null }[]; customerName?: string }>()

const auth = useAuthStore()
/** 只有超级管理员、店长、护理长能改数据（后端同样校验） */
const canEdit = computed(() => auth.hasAccess('care.growth.edit'))
const babyId = ref<string | null>(props.babies[0]?.id ?? null)
const standard = ref<GrowthStandard>('CN')
const months = ref(3)
const standardOptions = [
  { label: '国家卫健委标准', value: 'CN' },
  { label: 'WHO 标准', value: 'WHO' },
]
const monthOptions = [
  { label: '前 1 个月', value: 1 },
  { label: '前 2 个月', value: 2 },
  { label: '前 3 个月', value: 3 },
]
const report = ref<GrowthReport | null>(null)
const loading = ref(false)
const babyOptions = computed(() => props.babies.map((b) => ({ label: `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}`, value: b.id })))

async function load(silent = false) {
  if (!babyId.value) return
  if (!silent) loading.value = true
  try {
    report.value = await careGrowthApi.report(babyId.value, standard.value)
  } catch (e) {
    if (!silent) throw e
  } finally {
    loading.value = false
  }
}
watch([babyId, standard], () => load())

// 日常护理记录里新记了体重、别的同事录了测量，这里自动刷新，不用手动刷新页面
let timer: ReturnType<typeof setInterval> | undefined
const onFocus = () => load(true)
onMounted(() => {
  load()
  timer = setInterval(() => !document.hidden && !form.value && load(true), 30000)
  window.addEventListener('focus', onFocus)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', onFocus)
})

const svg = computed(() => (report.value && report.value.ready ? buildGrowthSvg(report.value, { months: months.value }) : ''))
const hasPoints = computed(() => !!report.value && (['weight', 'length', 'head'] as const).some((m) => report.value!.points[m].length > 0))

// ---- 记录一次测量 ----
const form = ref<{ date: number; weightG: number | null; lengthCm: number | null; headCm: number | null; note: string } | null>(null)
const saving = ref(false)
const ymdOf = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const open = () => (form.value = { date: Date.now(), weightG: null, lengthCm: null, headCm: null, note: '' })
async function save() {
  const f = form.value
  if (!f || !babyId.value) return
  if (f.weightG === null && f.lengthCm === null && f.headCm === null) return void message.warning('体重、身长、头围至少填一项')
  saving.value = true
  try {
    await careGrowthApi.addRecord({ babyProfileId: babyId.value, measuredAt: ymdOf(f.date), weightG: f.weightG ?? undefined, lengthCm: f.lengthCm ?? undefined, headCm: f.headCm ?? undefined, note: f.note || undefined })
    message.success('已记录')
    form.value = null
    await load()
  } finally {
    saving.value = false
  }
}
// ---- 曲线上鼠标移到点上（手机点一下）显示日期和数值，方便核对 ----
const tip = ref<{ x: number; y: number; text: string } | null>(null)
function onChartMove(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest?.('[data-tip]')
  if (!el) return void (tip.value = null)
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tip.value = { x: e.clientX - box.left, y: e.clientY - box.top, text: el.getAttribute('data-tip') ?? '' }
}

// ---- 生长数据表（可改，只有有权限的人看到操作按钮） ----
const SRC_LABEL: Record<string, string> = { GROWTH: '手工', DAILY: '日常护理', ADMISSION: '入所评估', BIRTH: '出生' }
const tableRows = computed(() => [...(report.value?.table ?? [])].reverse())
const editRow = ref<{ date: string; weightG: number | null; lengthCm: number | null; headCm: number | null; orig: GrowthTableRow } | null>(null)
const savingRow = ref(false)
const startEdit = (r: GrowthTableRow) => (editRow.value = { date: r.date, weightG: r.weightG, lengthCm: r.lengthCm, headCm: r.headCm, orig: r })
async function saveRow() {
  const e = editRow.value
  if (!e || !babyId.value) return
  // 只提交改过的项：没改的不会被“固化”成手工数据；清空 = 恢复系统里原来的数据
  const body: { weightG?: number | null; lengthCm?: number | null; headCm?: number | null } = {}
  if (e.weightG !== e.orig.weightG) body.weightG = e.weightG
  if (e.lengthCm !== e.orig.lengthCm) body.lengthCm = e.lengthCm
  if (e.headCm !== e.orig.headCm) body.headCm = e.headCm
  if (Object.keys(body).length === 0) return void (editRow.value = null)
  savingRow.value = true
  try {
    await careGrowthApi.addRecord({ babyProfileId: babyId.value, measuredAt: e.date, ...body })
    message.success('已修改，曲线已更新')
    editRow.value = null
    await load()
  } finally {
    savingRow.value = false
  }
}
function removeRow(r: GrowthTableRow) {
  if (!r.recordId) return
  dialog.warning({
    title: `去掉 ${r.date} 的手工修改？`,
    content: '这一天会恢复成系统里原来的数据（日常护理记录/入所评估/出生）；如果原来没有数据，这一天的点会消失。',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      await careGrowthApi.removeRecord(r.recordId!)
      await load()
    },
  })
}

// ---- 发给客户 ----
const share = ref<{ url: string; expiresAt: string } | null>(null)
const shareShow = ref(false)
const sharing = ref(false)
async function createShare() {
  if (!babyId.value) return
  sharing.value = true
  try {
    const r = await careGrowthApi.share(babyId.value)
    share.value = { url: `${window.location.origin}${r.path}`, expiresAt: r.expiresAt }
    shareShow.value = true
  } finally {
    sharing.value = false
  }
}
const shareText = computed(() => {
  const name = report.value?.baby.name ? `${report.value.baby.name}宝宝` : '宝宝'
  return share.value ? `${props.customerName ? props.customerName + '，' : ''}您好！这是${name}的生长曲线（对比国家标准），点击链接就能看，之后有新的测量数据会自动更新：\n${share.value.url}\n（链接 90 天内有效）` : ''
})
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制，去微信里粘贴发给客户')
  } catch {
    message.warning('这个浏览器不让自动复制，请长按文字手动复制')
  }
}
async function revoke() {
  if (!babyId.value) return
  const r = await careGrowthApi.revoke(babyId.value)
  message.success(r.revoked ? '已作废客户之前收到的链接' : '没有有效的链接')
  shareShow.value = false
}
async function download() {
  if (!svg.value || !report.value) return
  try {
    const nm = report.value.baby.name ?? `宝宝${report.value.baby.sequenceNo}`
    await downloadSvgAsPng(svg.value, `${nm}-生长曲线-${standard.value === 'WHO' ? 'WHO' : '国标'}-${new Date().toISOString().slice(0, 10)}.png`)
  } catch (e) {
    message.error((e as Error).message)
  }
}
const ratingType = (r: string) => (r === '中' ? 'success' : r === '中上' || r === '中下' ? 'warning' : 'error')
const src = (s: string) => (s === 'GROWTH' ? '测量' : s === 'DAILY' ? '日常护理' : s === 'ADMISSION' ? '入所评估' : '出生')
</script>

<template>
  <n-spin :show="loading">
    <n-space align="center" :wrap="true" style="margin-bottom: 10px">
      <n-select v-if="babies.length > 1" v-model:value="babyId" :options="babyOptions" style="width: 200px" />
      <n-radio-group v-model:value="standard" size="small">
        <n-radio-button v-for="o in standardOptions" :key="o.value" :value="o.value" :label="o.label" />
      </n-radio-group>
      <n-radio-group v-model:value="months" size="small">
        <n-radio-button v-for="o in monthOptions" :key="o.value" :value="o.value" :label="o.label" />
      </n-radio-group>
      <n-button v-if="canEdit" type="primary" @click="open">＋ 记录一次测量（体重/身长/头围）</n-button>
      <n-button :disabled="!svg" @click="download">⬇ 下载图片</n-button>
      <n-button :disabled="!svg" :loading="sharing" @click="createShare">🔗 生成客户链接</n-button>
    </n-space>

    <n-empty v-if="babies.length === 0" description="这位妈妈还没有宝宝档案，先在“概览”里添加宝宝" />
    <template v-else-if="report">
      <n-alert v-for="h in report.hints ?? []" :key="h" type="warning" :show-icon="false" style="margin-bottom: 10px">{{ h }}</n-alert>
      <n-alert v-if="!report.ready" type="warning" :show-icon="false" style="margin-bottom: 10px">
        要和国家标准对比，需要先补上：<b>{{ report.notReady.join('、') }}</b>（出生日期可在“新生儿入所评估”里填写后自动带入，也可以在 概览 → 宝宝档案 → 编辑 里直接填）。
      </n-alert>

      <template v-else>
        <n-alert type="info" :show-icon="false" style="margin-bottom: 10px">
          对比标准：{{ report.source }}（可在上方切换国家卫健委 / WHO 两套标准，曲线最多展示到第 3 个月）。日常护理记录里填的宝宝体重、身长、头围会自动画到曲线上并实时更新；也可以点上面“记录一次测量”单独补录。{{ report.baby.preterm ? '该宝宝是早产儿，月龄按矫正月龄计算。' : '' }}
        </n-alert>

        <div v-if="report.latest.length > 0" class="gc-latest">
          <div v-for="l in report.latest" :key="l.metric" class="gc-card">
            <div class="gc-name">{{ l.name }} <small>{{ l.date }}</small></div>
            <div class="gc-val">{{ l.value }}<small>{{ l.unit }}</small></div>
            <n-tag size="small" :type="ratingType(l.rating)" :bordered="false">{{ l.pctText }} · {{ l.rating }}</n-tag>
            <div class="gc-std">{{ report.standardLabel }} P3 {{ l.p3 }} / P50 {{ l.p50 }} / P97 {{ l.p97 }}</div>
          </div>
        </div>

        <n-empty v-if="!hasPoints" description="还没有测量数据：点上面“记录一次测量”，或在日常护理记录里记宝宝体重" style="margin: 20px 0" />
        <div v-else class="gc-chart" @mousemove="onChartMove" @mouseleave="tip = null" @click="onChartMove">
          <div v-html="svg" />
          <div v-if="tip" class="gc-tip" :style="{ left: tip.x + 12 + 'px', top: tip.y - 36 + 'px' }">{{ tip.text }}</div>
        </div>

        <n-card v-if="tableRows.length > 0" size="small" title="生长数据表（曲线上的点就来自这里）" style="margin-top: 12px">
          <div class="gc-sub" style="margin-bottom: 6px">
            按日期汇总了出生、新生儿入所评估、日常护理记录里的体重/身长/头围，以及手工修改。{{ canEdit ? '数据有误可以点“修改”，改过的会标“手工”，曲线随之更新。清空某一项 = 恢复系统里的原数据。' : '只有超级管理员、店长、护理长可以修改。' }}
          </div>
          <div class="gt-head"><span>日期</span><span>体重 g</span><span>身长 cm</span><span>头围 cm</span><span v-if="canEdit" class="gt-op">操作</span></div>
          <div v-for="r in tableRows" :key="r.date" class="gt-row" :class="{ 'gt-editing': editRow?.date === r.date }">
            <div class="gt-date"><b>{{ r.date }}</b><small v-if="r.ageDays !== null">第 {{ r.ageDays }} 天</small></div>
            <template v-if="editRow?.date === r.date">
              <n-input-number v-model:value="editRow.weightG" :min="500" :max="20000" :precision="0" :show-button="false" size="small" placeholder="体重" />
              <n-input-number v-model:value="editRow.lengthCm" :min="25" :max="120" :precision="1" :show-button="false" size="small" placeholder="身长" />
              <n-input-number v-model:value="editRow.headCm" :min="20" :max="60" :precision="1" :show-button="false" size="small" placeholder="头围" />
              <div class="gt-op"><n-button size="tiny" type="primary" :loading="savingRow" @click="saveRow">保存</n-button><n-button size="tiny" @click="editRow = null">取消</n-button></div>
            </template>
            <template v-else>
              <div v-for="k in (['weight', 'length', 'head'] as const)" :key="k" class="gt-cell">
                <span>{{ k === 'weight' ? (r.weightG ?? '-') : k === 'length' ? (r.lengthCm ?? '-') : (r.headCm ?? '-') }}</span>
                <small v-if="r.sources[k]" :class="{ 'gt-manual': r.sources[k] === 'GROWTH' }">{{ SRC_LABEL[r.sources[k]!] }}</small>
              </div>
              <div v-if="canEdit" class="gt-op">
                <n-button size="tiny" @click="startEdit(r)">修改</n-button>
                <n-button v-if="r.recordId" size="tiny" type="error" quaternary @click="removeRow(r)">去掉手工</n-button>
              </div>
            </template>
          </div>
        </n-card>
        <div v-if="hasPoints" class="gc-sub" style="margin-top: 6px">
          曲线上的点来源：{{ [...new Set((['weight', 'length', 'head'] as const).flatMap((m) => report!.points[m].map((p) => src(p.source))))].join('、') }}。
        </div>
      </template>
    </template>

    <n-modal :mask-closable="false" :show="!!form" @update:show="(v: boolean) => !v && (form = null)">
      <n-card v-if="form" title="记录一次测量" style="width: min(420px, 96vw)" :bordered="false" role="dialog" closable @close="form = null" aria-modal="true">
        <n-space vertical :size="10">
          <div><div class="gc-lab">测量日期</div><n-date-picker v-model:value="form.date" type="date" style="width: 100%" :is-date-disabled="(ts: number) => ts > Date.now()" /></div>
          <div class="gc-two">
            <div><div class="gc-lab">体重 g</div><n-input-number v-model:value="form.weightG" :min="500" :max="20000" :precision="0" :show-button="false" placeholder="如 3850" style="width: 100%" /></div>
            <div><div class="gc-lab">身长 cm</div><n-input-number v-model:value="form.lengthCm" :min="25" :max="120" :precision="1" :show-button="false" placeholder="如 51.5" style="width: 100%" /></div>
            <div><div class="gc-lab">头围 cm</div><n-input-number v-model:value="form.headCm" :min="20" :max="60" :precision="1" :show-button="false" placeholder="如 35.2" style="width: 100%" /></div>
          </div>
          <div class="gc-sub">三项可以只填测了的；身长是躺着量的头顶到脚跟，头围是右眉弓上缘经枕骨粗隆最高点绕一圈。</div>
          <div><div class="gc-lab">备注（选填）</div><n-input v-model:value="form.note" /></div>
        </n-space>
        <template #footer><n-space justify="end"><n-button @click="form = null">取消</n-button><n-button type="primary" :loading="saving" @click="save">保存</n-button></n-space></template>
      </n-card>
    </n-modal>

    <n-modal :show="shareShow" :mask-closable="false" @update:show="(v: boolean) => (shareShow = v)">
      <n-card title="发给客户" style="width: min(520px, 96vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="shareShow = false">
        <div class="gc-sub" style="margin-bottom: 8px">客户手机打开链接就能看到宝宝的生长曲线和最新对比，之后有新数据会自动更新。重新生成链接会让旧链接作废。</div>
        <n-input :value="shareText" type="textarea" readonly :autosize="{ minRows: 4 }" />
        <n-space style="margin-top: 10px">
          <n-button type="primary" @click="copy(shareText)">复制全部内容</n-button>
          <n-button @click="copy(share!.url)">只复制链接</n-button>
          <n-button type="error" quaternary @click="revoke">作废这个链接</n-button>
        </n-space>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.gc-chart {
  position: relative;
}
.gc-tip {
  position: absolute;
  z-index: 5;
  max-width: 260px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.9);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  pointer-events: none;
  white-space: nowrap;
}
.gt-head,
.gt-row {
  display: grid;
  grid-template-columns: 112px repeat(3, minmax(0, 1fr)) auto;
  gap: 6px 10px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
  font-size: 14px;
}
.gt-head {
  color: #888;
  font-size: 12px;
  border-bottom: 1px solid #e6e6e6;
}
.gt-date small,
.gt-cell small {
  display: block;
  color: #aaa;
  font-size: 11px;
}
.gt-cell small.gt-manual {
  color: #2a64b0;
  font-weight: 600;
}
.gt-op {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  min-width: 96px;
}
.gt-editing {
  background: #f6fbf8;
}
@media (max-width: 767px) {
  .gt-head,
  .gt-row {
    grid-template-columns: 88px repeat(3, minmax(0, 1fr));
  }
  .gt-op {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
.gc-latest {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.gc-card {
  padding: 10px 12px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fff;
}
.gc-name {
  color: #666;
  font-size: 13px;
}
.gc-name small {
  margin-left: 6px;
  color: #aaa;
}
.gc-val {
  font-size: 24px;
  font-weight: 700;
  margin: 2px 0 6px;
}
.gc-val small {
  margin-left: 3px;
  font-size: 13px;
  font-weight: 400;
  color: #888;
}
.gc-std {
  margin-top: 6px;
  color: #999;
  font-size: 12px;
}
.gc-chart {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}
.gc-chart :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.gc-rec {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
  font-size: 14px;
}
.gc-rec:last-child {
  border-bottom: none;
}
.gc-sub {
  color: #999;
  font-size: 12px;
}
.gc-lab {
  margin-bottom: 3px;
  color: #666;
  font-size: 12px;
}
.gc-two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
</style>
