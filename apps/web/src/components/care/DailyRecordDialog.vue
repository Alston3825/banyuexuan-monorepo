<script setup lang="ts">
/**
 * 某一天的日常护理记录（妈妈 + 每个宝宝 + 宝宝 24 小时喂养记录单），整天一起保存。
 * 手机优先：分成“宝宝/妈妈”标签页，喂养用卡片行录入；也可以拍纸质记录单照片，AI 识别后预填，
 * 人工核对（标黄的是没把握的）后保存——保存之前不会写进数据库。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NModal, NSelect, NSpace, NSpin, NTabPane, NTabs, NTag } from 'naive-ui'
import { careDailyApi, careDocumentApi } from '../../api/modules/care-archive.api'
import type { CareDocument, DailyDay, DailySpecs, ExtractWarning, FeedingEntry } from '../../api/types/care-archive'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'
import CareDocImages from './CareDocImages.vue'
import FeedingTable from './FeedingTable.vue'
import SpecForm from './SpecForm.vue'
import DailySignPanel from './DailySignPanel.vue'

const props = defineProps<{ show: boolean; motherProfileId: string; date: string }>()
const emit = defineEmits<{ 'update:show': [value: boolean]; saved: []; 'add-baby': [] }>()

const auth = useAuthStore()
const nurse = computed(() => (auth.account as { realName?: string } | null)?.realName ?? '')

let specsCache: DailySpecs | null = null
const specs = ref<DailySpecs | null>(null)
const day = ref<DailyDay | null>(null)
const loading = ref(false)
const saving = ref(false)

const motherValues = ref<Record<string, unknown>>({})
const babyStates = ref<Record<string, { values: Record<string, unknown>; feedings: FeedingEntry[] }>>({})
const warnings = ref<ExtractWarning[]>([])
const aiBabyId = ref<string | null>(null)
const activeTab = ref('')

// 拍照识别
const doc = ref<CareDocument | null>(null)
const photoBabyId = ref<string | null>(null)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const feedInput = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
const extracting = computed(() => doc.value?.extractStatus === 'PENDING' || doc.value?.extractStatus === 'RUNNING')
const warnCount = computed(() => warnings.value.filter((w) => w.level !== 'info' && !w.field.includes('.')).length)

const title = computed(() => {
  const [, m, d] = props.date.split('-')
  return `${Number(m)}月${Number(d)}日 日常护理记录`
})
const babyOptions = computed(() => (day.value?.babies ?? []).map((b) => ({ label: `宝宝${b.baby.sequenceNo}${b.baby.name ? '：' + b.baby.name : ''}`, value: b.baby.id })))
const babyLabel = (id: string) => babyOptions.value.find((o) => o.value === id)?.label ?? '宝宝'

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

function fill(d: DailyDay) {
  day.value = d
  const m: Record<string, unknown> = { ...(d.record ?? {}) }
  if (!d.record && !m.motherNurseName) m.motherNurseName = nurse.value
  motherValues.value = m
  const bs: typeof babyStates.value = {}
  for (const b of d.babies) {
    const v: Record<string, unknown> = { ...(b.record ?? {}) }
    if (!b.record) {
      if (b.defaultAgeDays !== null) v.ageDays = b.defaultAgeDays // 出生天数按出生日期预填
      v.dayNurseName = nurse.value
    }
    bs[b.baby.id] = { values: v, feedings: b.feedings.map((f) => ({ ...f })) }
  }
  babyStates.value = bs
  if (!bs[activeTab.value] && activeTab.value !== 'mother') activeTab.value = d.babies[0]?.baby.id ?? 'mother'
}

async function load() {
  loading.value = true
  stopPolling()
  doc.value = null
  warnings.value = []
  aiBabyId.value = null
  try {
    if (!specsCache) specsCache = await careDailyApi.specs()
    specs.value = specsCache
    const d = await careDailyApi.day(props.motherProfileId, props.date)
    activeTab.value = ''
    fill(d)
    photoBabyId.value = d.babies[0]?.baby.id ?? null
    if (d.record?.documentId) careDocumentApi.get(d.record.documentId).then((x) => (doc.value = x)).catch(() => undefined)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.show,
  (v) => {
    if (v) load()
    else stopPolling()
  },
  { immediate: true },
)
onBeforeUnmount(stopPolling)

/** AI 识别结果拆成妈妈栏 / 宝宝栏 / 喂养表，填进表单（覆盖当前内容，保存前还能改） */
function applyExtraction(d: CareDocument) {
  if (!specs.value || !d.extractData) return
  const data = d.extractData as Record<string, unknown>
  const motherKeys = new Set(specs.value.mother.flatMap((g) => g.fields.map((f) => f.key)))
  const babyKeys = new Set(specs.value.baby.flatMap((g) => g.fields.map((f) => f.key)))
  const m: Record<string, unknown> = {}
  const b: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (motherKeys.has(k)) m[k] = v
    else if (babyKeys.has(k)) b[k] = v
  }
  motherValues.value = { ...motherValues.value, ...m }
  const id = d.babyProfileId ?? photoBabyId.value
  if (id && babyStates.value[id]) {
    babyStates.value[id] = {
      values: { ...babyStates.value[id].values, ...b },
      feedings: Array.isArray(data.feedings) ? (data.feedings as FeedingEntry[]) : babyStates.value[id].feedings,
    }
    aiBabyId.value = id
    activeTab.value = id
  }
  warnings.value = d.extractWarnings ?? []
}

const feedingCount = (e: FeedingEntry[]) => e.length

/** 宝宝单页（喂养记录单）识别结果：宝宝体征 + 喂养表填进当前宝宝；原来已有喂养记录时问“替换还是追加” */
function applyBabySheet(d: CareDocument) {
  if (!specs.value || !d.extractData) return
  const data = d.extractData as Record<string, unknown>
  const id = d.babyProfileId ?? photoBabyId.value
  if (!id || !babyStates.value[id]) return
  const babyKeys = new Set(specs.value.baby.flatMap((g) => g.fields.map((f) => f.key)))
  const b: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (babyKeys.has(k) && v !== null && v !== '') b[k] = v
  const rows = Array.isArray(data.feedings) ? (data.feedings as FeedingEntry[]) : []
  const old = babyStates.value[id].feedings
  const put = (feedings: FeedingEntry[], append: boolean) => {
    babyStates.value[id] = { values: { ...babyStates.value[id].values, ...b }, feedings }
    // 追加时新行的提醒下标要整体后移，这里简单处理：追加就不再标黄
    warnings.value = append ? [] : d.extractWarnings ?? []
    aiBabyId.value = id
    activeTab.value = id
    message.info(`已填入 ${rows.length} 条喂养记录，请对照原图核对后保存`)
  }
  // 纸上的日期和当前这一天对不上，先提醒（纸上只写“月.日”）
  const sd = String(data.sheetDate ?? '').match(/(\d{1,2})\s*[.\-/月]\s*(\d{1,2})/)
  if (sd) {
    const [, , pm, pd] = props.date.match(/(\d{4})-(\d{2})-(\d{2})/) ?? []
    if (pm && (Number(sd[1]) !== Number(pm) || Number(sd[2]) !== Number(pd))) {
      message.warning(`注意：纸上的日期是 ${sd[1]}月${sd[2]}日，和当前记录日期 ${Number(pm)}月${Number(pd)}日 对不上，请确认拍的是这一天的记录单`, { duration: 10000, closable: true })
    }
  }
  if (old.length === 0) return put(rows, false)
  dialog.warning({
    title: '识别到 ' + rows.length + ' 条喂养记录',
    content: `当前这一天已经有 ${feedingCount(old)} 条喂养记录。要怎么处理识别出来的？`,
    positiveText: '替换成识别结果',
    negativeText: '追加到后面',
    closable: true,
    onPositiveClick: () => put(rows, false),
    onNegativeClick: () => put([...old, ...rows], true),
  })
}

function startPolling(id: string) {
  stopPolling()
  const started = Date.now()
  timer = setInterval(async () => {
    try {
      const d = await careDocumentApi.get(id)
      doc.value = d
      if (d.extractStatus === 'DONE') {
        stopPolling()
        if (d.extractScope === 'BABY_FEEDING') applyBabySheet(d)
        else applyExtraction(d)
        message.success('AI 已识别完成，请对照原图逐项核对')
      } else if (d.extractStatus === 'FAILED') {
        stopPolling()
        message.error(`AI 识别失败：${d.extractError ?? '未知原因'}，可以重试或手工填写`)
      } else if (Date.now() - started > 6 * 60_000) stopPolling()
    } catch {
      /* 偶发网络错误，下一轮再试 */
    }
  }, 2500)
}

async function onPick(e: Event, babySheet = false) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  // 喂养记录单旁边的按钮：照片归当前标签页的宝宝，只识别宝宝单页
  const babyId = babySheet && babyOptions.value.some((o) => o.value === activeTab.value) ? activeTab.value : photoBabyId.value
  uploading.value = true
  try {
    doc.value = await careDocumentApi.upload(files, {
      docType: 'DAILY_RECORD',
      motherProfileId: props.motherProfileId,
      babyProfileId: babyId ?? undefined,
      docDate: props.date,
      ...(babySheet ? { scope: 'BABY_FEEDING' as const } : {}),
    })
    startPolling(doc.value.id)
    message.success('照片已上传，AI 正在识别…')
  } finally {
    uploading.value = false
  }
}

async function retry() {
  if (!doc.value) return
  doc.value = await careDocumentApi.extract(doc.value.id)
  startPolling(doc.value.id)
}

async function save() {
  if (!day.value) return
  saving.value = true
  try {
    const saved = await careDailyApi.save({
      motherProfileId: props.motherProfileId,
      date: props.date,
      documentId: doc.value?.id,
      version: day.value.record?.version,
      mother: motherValues.value,
      babies: day.value.babies.map((b) => ({ babyProfileId: b.baby.id, values: babyStates.value[b.baby.id].values, feedings: babyStates.value[b.baby.id].feedings })),
    })
    message.success('当天的日常护理记录已保存')
    fill(saved)
    warnings.value = []
    emit('saved')
  } finally {
    saving.value = false
  }
}

const close = () => emit('update:show', false)
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v) => emit('update:show', v)">
    <n-card :title="title" style="width: min(1100px, 100vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="close">
      <template #header-extra>
        <n-space :size="6">
          <n-tag v-if="day?.roomNo" type="info" size="small" round>房号 {{ day.roomNo }}</n-tag>
          <n-tag size="small" round>入住第 {{ day?.record?.stayDay ?? day?.defaults.stayDay ?? '-' }} 天</n-tag>
          <n-tag :type="day?.record ? 'success' : 'warning'" size="small" round>{{ day?.record ? '已保存' : '尚未保存' }}</n-tag>
        </n-space>
      </template>

      <n-spin :show="loading">
        <!-- 拍照识别 -->
        <div class="dr-bar">
          <input ref="fileInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="(e) => onPick(e, false)" />
          <!-- 喂养记录单旁边的“拍照识别”：手机上可直接拍照，也能从相册选（可多张） -->
          <input ref="feedInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="(e) => onPick(e, true)" />
          <n-space align="center" :wrap="true">
            <n-select v-if="babyOptions.length > 1" v-model:value="photoBabyId" :options="babyOptions" size="small" style="width: 150px" placeholder="这张纸是哪个宝宝" />
            <n-button size="small" :loading="uploading" :disabled="extracting || !specs" @click="fileInput?.click()">
              📷 拍整张记录单（宝宝+妈妈），AI 识别预填
            </n-button>
            <n-button v-if="doc && !extracting" size="small" @click="retry">重新识别</n-button>
            <span class="dr-tip">不拍照也可以直接在下面填写。</span>
          </n-space>
        </div>
        <n-alert v-if="day && day.babies.length === 0" type="warning" :bordered="false" style="margin-top: 8px">
          <n-space align="center" :wrap="true">
            <span><b>这位妈妈还没有宝宝档案</b>，所以下面只有妈妈的内容，看不到宝宝的体征、体温和 24 小时喂养记录。先添加宝宝，这里就会出现“宝宝”页签。</span>
            <n-button size="small" type="primary" @click="emit('update:show', false); emit('add-baby')">去添加宝宝</n-button>
          </n-space>
        </n-alert>
        <n-alert v-if="extracting" type="info" :bordered="false" style="margin-top: 8px"><n-space align="center"><n-spin size="small" />AI 正在识别，一般 20～40 秒…</n-space></n-alert>
        <n-alert v-else-if="doc?.extractStatus === 'FAILED'" type="error" :bordered="false" style="margin-top: 8px">AI 识别失败：{{ doc.extractError }}，可点“重新识别”或手工填写。</n-alert>
        <n-alert v-else-if="doc?.extractStatus === 'DONE' && aiBabyId" type="warning" :bordered="false" style="margin-top: 8px">
          AI 已预填（{{ babyLabel(aiBabyId) }}{{ doc?.extractScope === 'BABY_FEEDING' ? ' 的体征和喂养记录' : ' 和妈妈栏' }}）。<b>请对照原图逐项核对</b>，标黄的 {{ warnCount }} 项 AI 没把握；<b>点底部“保存”前不会写入。</b>
        </n-alert>
        <details v-if="doc && doc.files.length > 0" class="dr-photo">
          <summary>查看纸质原件照片</summary>
          <CareDocImages :document-id="doc.id" :files="doc.files" :width="420" />
        </details>

        <n-tabs v-if="day && specs" v-model:value="activeTab" type="segment" style="margin-top: 10px" animated>
          <n-tab-pane v-for="b in day.babies" :key="b.baby.id" :name="b.baby.id" :tab="`👶 ${babyLabel(b.baby.id)}`">
            <SpecForm v-model="babyStates[b.baby.id].values" :spec="{ groups: specs.baby }" :warnings="aiBabyId === b.baby.id ? warnings : []" />
            <div class="dr-feedhead">
              <h4 class="dr-h" style="margin: 0">24 小时宝宝喂养记录单</h4>
              <n-button type="primary" size="small" :loading="uploading" :disabled="extracting" @click="activeTab = b.baby.id; feedInput?.click()">📷 拍照识别喂养记录</n-button>
            </div>
            <div class="dr-tip" style="margin: 4px 0 8px">拍下《新生儿日常护理记录》这张纸（可多拍几张），AI 自动把每一行喂养/排泄记录填进下面，核对后点底部“保存”。</div>
            <FeedingTable
              v-model="babyStates[b.baby.id].feedings"
              :columns="specs.feeding"
              :warnings="aiBabyId === b.baby.id ? warnings : []"
              :default-nurse="nurse"
              :active-medications="b.activeMedications"
            />
          </n-tab-pane>
          <n-tab-pane name="mother" tab="🤱 妈妈">
            <SpecForm v-model="motherValues" :spec="{ groups: specs.mother }" :warnings="warnings" />
          </n-tab-pane>
        </n-tabs>

        <!-- 护理师签字 + 客户确认：记录保存后才出现；记录一保存（版本号变了）就重新载入，签字是否过期立刻可见 -->
        <DailySignPanel v-if="day" :key="`${props.date}-${day.record?.version ?? 'new'}`" :mother-profile-id="motherProfileId" :date="date" :can-sign="!!day.record" @changed="emit('saved')" />
      </n-spin>

      <template #footer>
        <n-space justify="end">
          <n-button @click="close">关闭</n-button>
          <n-button type="primary" :loading="saving" :disabled="extracting || !day" @click="save">保存当天记录</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.dr-bar {
  padding-bottom: 8px;
  border-bottom: 1px dashed #e5e5e5;
}
.dr-tip {
  color: #999;
  font-size: 12px;
}
.dr-photo {
  margin-top: 8px;
  font-size: 13px;
}
.dr-photo summary {
  cursor: pointer;
  color: #2a64b0;
  margin-bottom: 6px;
}
.dr-feedhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 14px 0 0;
  flex-wrap: wrap;
}
.dr-h {
  margin: 14px 0 8px;
  padding-left: 8px;
  border-left: 3px solid #d9822b;
  font-size: 14px;
  color: #2a64b0;
}
:deep(.n-card__content) {
  max-height: 72vh;
  overflow: auto;
}
</style>
