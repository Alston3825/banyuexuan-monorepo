<script setup lang="ts">
/**
 * 某一天的日常护理记录（妈妈 + 每个宝宝 + 宝宝 24 小时喂养记录单），整天一起保存。
 * 手机优先：分成“宝宝/妈妈”标签页，喂养用卡片行录入；也可以拍纸质记录单照片，AI 识别后预填，
 * 人工核对（标黄的是没把握的）后保存——保存之前不会写进数据库。
 */
import { computed, onBeforeUnmount, onErrorCaptured, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NModal, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { careDailyApi, careDocumentApi } from '../../api/modules/care-archive.api'
import type { CareDocument, DailyDay, DailySpecs, ExtractWarning, FeedingEntry } from '../../api/types/care-archive'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'
import CareDocImages from './CareDocImages.vue'
import DailyPaperSheet from './DailyPaperSheet.vue'
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

// 拍照识别
const doc = ref<CareDocument | null>(null)
const photoBabyId = ref<string | null>(null)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
const extracting = computed(() => doc.value?.extractStatus === 'PENDING' || doc.value?.extractStatus === 'RUNNING')
const warnCount = computed(() => warnings.value.filter((w) => w.level !== 'info' && !w.field.includes('.')).length)

const title = computed(() => {
  const [, m, d] = props.date.split('-')
  return `${Number(m)}月${Number(d)}日 日常护理记录`
})
const babyOptions = computed(() => (day.value?.babies ?? []).map((b) => ({ label: `宝宝${b.baby.sequenceNo}${b.baby.name ? '：' + b.baby.name : ''}`, value: b.baby.id })))
const babyLabel = (id: string) => babyOptions.value.find((o) => o.value === id)?.label ?? '宝宝'


// ---- 草稿自动保存：核对/填写到一半页面被刷新、闪退、误关，重新打开能恢复，不用重拍重填 ----
const draftKey = () => `daily-draft:${props.motherProfileId}:${props.date}`
let draftReady = false
let draftTimer: ReturnType<typeof setTimeout> | null = null
function writeDraft() {
  if (!draftReady || !day.value) return
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), version: day.value.record?.version ?? null, mother: motherValues.value, babies: babyStates.value, documentId: doc.value?.id ?? null, aiBabyId: aiBabyId.value }))
  } catch {
    /* 存储满了/被禁用就算了，不影响正常填写 */
  }
}
function scheduleDraft() {
  if (!draftReady) return
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(writeDraft, 800)
}
function clearDraft() {
  draftReady = false
  if (draftTimer) clearTimeout(draftTimer)
  try {
    localStorage.removeItem(draftKey())
  } catch {
    /* ignore */
  }
}
watch([motherValues, babyStates], scheduleDraft, { deep: true })
function offerDraft() {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(draftKey())
  } catch {
    /* ignore */
  }
  if (!raw) return void (draftReady = true)
  let d: { at: number; version: number | null; mother: Record<string, unknown>; babies: typeof babyStates.value; documentId: string | null; aiBabyId: string | null }
  try {
    d = JSON.parse(raw)
  } catch {
    return void (draftReady = true)
  }
  // 草稿之后别人又保存过（版本号变了）就不再提示，避免用旧内容盖掉新的
  if (d.version !== (day.value?.record?.version ?? null) || Date.now() - d.at > 3 * 86_400_000) {
    clearDraft()
    draftReady = true
    return
  }
  const when = new Date(d.at)
  dialog.info({
    title: '发现上次没保存的内容',
    content: `${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')} 填写/识别的内容还没有保存，要恢复吗？`,
    positiveText: '恢复',
    negativeText: '不要了',
    closable: false,
    maskClosable: false,
    onPositiveClick: () => {
      motherValues.value = d.mother
      const bs = { ...babyStates.value }
      for (const [id, st] of Object.entries(d.babies)) if (bs[id]) bs[id] = st
      babyStates.value = bs
      aiBabyId.value = d.aiBabyId
      if (d.documentId) careDocumentApi.get(d.documentId).then((x) => ((doc.value = x), (warnings.value = x.extractWarnings ?? []))).catch(() => undefined)
      draftReady = true
    },
    onNegativeClick: () => {
      clearDraft()
      draftReady = true
    },
  })
}

// 某个子组件渲染出错时，别让整页白屏丢内容：提示一下，草稿已自动保存
const renderError = ref('')
onErrorCaptured((err) => {
  renderError.value = (err as Error)?.message ?? String(err)
  writeDraft()
  return false
})

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

function fill(d: DailyDay) {
  day.value = d
  const m: Record<string, unknown> = { ...(d.record ?? {}) }
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
}

async function load() {
  loading.value = true
  draftReady = false
  renderError.value = ''
  stopPolling()
  doc.value = null
  warnings.value = []
  aiBabyId.value = null
  try {
    if (!specsCache) specsCache = await careDailyApi.specs()
    specs.value = specsCache
    const d = await careDailyApi.day(props.motherProfileId, props.date)
    fill(d)
    photoBabyId.value = d.babies[0]?.baby.id ?? null
    if (d.record?.documentId) careDocumentApi.get(d.record.documentId).then((x) => (doc.value = x)).catch(() => undefined)
    offerDraft()
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
  }
  warnings.value = d.extractWarnings ?? []
  checkSheetDate(data)
}

const feedingCount = (e: FeedingEntry[]) => e.length

/** 纸上的日期（只写“月.日”）和当前这一天对不上，提醒一下，防止拍错日子的记录单 */
function checkSheetDate(data: Record<string, unknown>) {
  const sd = String(data.sheetDate ?? '').match(/(\d{1,2})\s*[.\-/月]\s*(\d{1,2})/)
  if (!sd) return
  const [, , pm, pd] = props.date.match(/(\d{4})-(\d{2})-(\d{2})/) ?? []
  if (pm && (Number(sd[1]) !== Number(pm) || Number(sd[2]) !== Number(pd))) {
    message.warning(`注意：纸上的日期是 ${sd[1]}月${sd[2]}日，和当前记录日期 ${Number(pm)}月${Number(pd)}日 对不上，请确认拍的是这一天的记录单`, { duration: 10000, closable: true })
  }
}

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
    message.info(`已填入 ${rows.length} 条喂养记录，请对照原图核对后保存`)
  }
  checkSheetDate(data)
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

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  const babyId = photoBabyId.value
  uploading.value = true
  try {
    doc.value = await careDocumentApi.upload(files, {
      docType: 'DAILY_RECORD',
      motherProfileId: props.motherProfileId,
      babyProfileId: babyId ?? undefined,
      docDate: props.date,
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
    clearDraft()
    fill(saved)
    draftReady = true
    warnings.value = []
    emit('saved')
  } finally {
    saving.value = false
  }
}

const close = () => emit('update:show', false)
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v) => emit('update:show', v)">
    <n-card :title="title" style="width: min(1280px, 100vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="close">
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
          <input ref="fileInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="onPick" />
          <n-space align="center" :wrap="true">
            <n-select v-if="babyOptions.length > 1" v-model:value="photoBabyId" :options="babyOptions" size="small" style="width: 150px" placeholder="这张纸是哪个宝宝" />
            <n-button type="primary" :loading="uploading" :disabled="extracting || !specs" @click="fileInput?.click()">
              📷 拍整张记录单，AI 一次识别宝宝和妈妈
            </n-button>
            <n-button v-if="doc && !extracting" secondary type="primary" @click="retry">重新识别</n-button>
            <span class="dr-tip">宝宝和妈妈在同一张纸上，拍一次（可多张）就全部预填；不拍照也可以直接在下面填写。</span>
          </n-space>
        </div>
        <n-alert v-if="renderError" type="error" :bordered="false" style="margin-top: 8px">页面显示出了点问题（{{ renderError }}）。已填的内容自动保存了草稿，关掉再打开这一天就能恢复；如果反复出现请告诉我。</n-alert>
        <n-alert v-if="day && day.babies.length === 0" type="warning" :bordered="false" style="margin-top: 8px">
          <n-space align="center" :wrap="true">
            <span><b>这位妈妈还没有宝宝档案</b>，所以下面只有妈妈的内容，看不到宝宝的体征、体温和 24 小时喂养记录。先添加宝宝，这里就会出现“宝宝”页签。</span>
            <n-button size="small" type="primary" @click="emit('update:show', false); emit('add-baby')">去添加宝宝</n-button>
          </n-space>
        </n-alert>
        <n-alert v-if="extracting" type="info" :bordered="false" style="margin-top: 8px"><n-space align="center"><n-spin size="small" />AI 正在识别，一般 20～40 秒…</n-space></n-alert>
        <n-alert v-else-if="doc?.extractStatus === 'FAILED'" type="error" :bordered="false" style="margin-top: 8px">AI 识别失败：{{ doc.extractError }}，可点“重新识别”或手工填写。</n-alert>
        <n-alert v-else-if="doc?.extractStatus === 'DONE' && aiBabyId" type="warning" :bordered="false" style="margin-top: 8px">
          AI 已预填（{{ babyLabel(aiBabyId) }}{{ doc?.extractScope === 'BABY_FEEDING' ? ' 的体征和喂养记录' : ' 的体征、喂养记录，以及妈妈栏' }}）。<b>请对照原图逐项核对</b>，标黄的 {{ warnCount }} 项 AI 没把握；<b>点底部“保存”前不会写入。</b>
        </n-alert>
        <details v-if="doc && doc.files.length > 0" class="dr-photo">
          <summary>查看纸质原件照片</summary>
          <CareDocImages :document-id="doc.id" :files="doc.files" :width="420" />
        </details>

        <!-- 一张页面 = 一张纸：先是宝宝（体征/体温/24小时喂养记录单/班次总结），再是产妇日常护理；拍一次照两边一起识别 -->
        <div v-if="day && specs" class="dr-sheet">
          <div class="dr-nav">
            <span class="dr-tip">快速跳转：</span>
            <n-button v-for="b in day.babies" :key="b.baby.id" size="tiny" secondary @click="jump(`dr-baby-${b.baby.id}`)">👶 {{ babyLabel(b.baby.id) }}</n-button>
            <n-button size="tiny" secondary @click="jump('dr-mother')">🤱 产妇日常护理</n-button>
          </div>

          <DailyPaperSheet
            v-model:baby-states="babyStates"
            v-model:mother-values="motherValues"
            :specs="specs"
            :day="day"
            :date="date"
            :nurse="nurse"
            :warnings="warnings"
            :ai-baby-id="aiBabyId"
            :baby-label="babyLabel"
          />
        </div>

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
  padding: 10px 12px;
  border: 1px solid #b7e0c8;
  border-radius: 8px;
  background: #eaf6ee;
}
.dr-bar .dr-tip {
  color: #4a7c5f;
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
.dr-sec {
  margin-top: 14px;
  padding: 10px 12px 14px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fff;
  scroll-margin-top: 8px;
}
.dr-sectitle {
  margin: -2px 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: #2a64b0;
}
.dr-sectitle small {
  margin-left: 8px;
  font-weight: 400;
  color: #888;
}
.dr-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
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
@media (max-width: 767px) {
  .dr-tip {
    display: none;
  }
  :deep(.n-card__content) {
    max-height: calc(100vh - 190px);
    padding: 8px 10px;
  }
}
</style>
