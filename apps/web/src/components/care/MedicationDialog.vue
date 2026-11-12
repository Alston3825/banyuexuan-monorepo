<script setup lang="ts">
/**
 * 新生儿用药委托书：新签 / 查看 / 修改 / 变更（基于上一份新签，上一份自动变“已替换”）。
 * 手机优先：药品做成卡片行；可拍纸质委托书照片，AI 识别药名、用法、服药时间、签字人后预填，
 * 人工核对（标黄的是没把握的）再保存。家属签字的原件照片随这一份委托书保存，用来分清责任。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDatePicker, NInput, NInputNumber, NModal, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { careDocumentApi, careMedicationApi } from '../../api/modules/care-archive.api'
import {
  MED_ROUTE_LABEL,
  MED_TIME_LABEL,
  type CareDocument,
  type ExtractWarning,
  type MedicationAuth,
  type MedicationItem,
  type MedicationSpecs,
} from '../../api/types/care-archive'
import { useAuthStore } from '../../stores/auth'
import { message } from '../../utils/discrete-api'
import CareDocImages from './CareDocImages.vue'
import SpecForm from './SpecForm.vue'

type Mode = 'create' | 'view' | 'edit' | 'change'
const props = defineProps<{
  show: boolean
  motherProfileId: string
  babies: { value: string; label: string }[]
  mode: Mode
  /** 查看/修改/变更时的那一份委托书 */
  auth: MedicationAuth | null
  defaultBabyId?: string | null
}>()
const emit = defineEmits<{ 'update:show': [value: boolean]; saved: [] }>()

const authStore = useAuthStore()
const nurse = computed(() => (authStore.account as { realName?: string } | null)?.realName ?? '')

let specsCache: MedicationSpecs | null = null
const specs = ref<MedicationSpecs | null>(null)
const babyId = ref<string | null>(null)
const header = ref<Record<string, unknown>>({})
const items = ref<MedicationItem[]>([])
const changeNote = ref('')
const warnings = ref<ExtractWarning[]>([])
const doc = ref<CareDocument | null>(null)
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const readonly = computed(() => props.mode === 'view')
const extracting = computed(() => doc.value?.extractStatus === 'PENDING' || doc.value?.extractStatus === 'RUNNING')
const title = computed(() => ({ create: '新建用药委托书', view: '用药委托书', edit: '修改用药委托书', change: '变更用药委托书（新签一份）' })[props.mode])
const today = () => new Date().toISOString().slice(0, 10)
const warnOf = (i: number, key: string) => warnings.value.find((w) => w.field === `items.${i}.${key}` && w.level !== 'info')?.message
const headerWarnCount = computed(() => warnings.value.filter((w) => w.level !== 'info' && !w.field.includes('.')).length)

const pad = (n: number) => String(n).padStart(2, '0')
const toTs = (iso: unknown): number | null => {
  if (typeof iso !== 'string' || iso.length < 10) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const fromTs = (ts: number | null): string | null => (ts === null ? null : `${new Date(ts).getFullYear()}-${pad(new Date(ts).getMonth() + 1)}-${pad(new Date(ts).getDate())}`)

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

function blankItem(): MedicationItem {
  return { drugName: '', route: null, times: [] }
}

async function init() {
  stopPolling()
  doc.value = null
  warnings.value = []
  changeNote.value = ''
  if (!specsCache) specsCache = await careMedicationApi.specs()
  specs.value = specsCache
  const a = props.auth
  babyId.value = a?.babyProfileId ?? props.defaultBabyId ?? props.babies[0]?.value ?? null
  if (a && props.mode !== 'create') {
    header.value = props.mode === 'change' ? { authDate: today(), medicationStart: today(), nurseName: nurse.value, signerName: null } : { ...a }
    items.value = a.items.map((it) => ({ ...it, times: Array.isArray(it.times) ? [...it.times] : [] }))
    if (props.mode !== 'change' && a.document) careDocumentApi.get(a.document.id).then((d) => (doc.value = d)).catch(() => undefined)
  } else {
    header.value = { authDate: today(), medicationStart: today(), nurseName: nurse.value }
    items.value = [blankItem()]
  }
}

watch(
  () => props.show,
  (v) => {
    if (v) init()
    else stopPolling()
  },
  { immediate: true },
)
onBeforeUnmount(stopPolling)

function applyExtraction(d: CareDocument) {
  const data = (d.extractData ?? {}) as Record<string, unknown>
  const next = { ...header.value }
  for (const f of specs.value?.header ?? []) if (data[f.key] !== undefined) next[f.key] = data[f.key]
  header.value = next
  if (Array.isArray(data.items) && data.items.length > 0) items.value = (data.items as MedicationItem[]).map((it) => ({ ...it, times: Array.isArray(it.times) ? it.times : [] }))
  warnings.value = d.extractWarnings ?? []
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
        applyExtraction(d)
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
  if (files.length === 0 || !babyId.value) return
  uploading.value = true
  try {
    // 新建/变更：上传后自动识别预填；修改已有委托书：只补传签字原件，不识别
    const extract = props.mode === 'create' || props.mode === 'change'
    if (doc.value) doc.value = await careDocumentApi.addFiles(doc.value.id, files)
    else doc.value = await careDocumentApi.upload(files, { docType: 'MEDICATION_AUTH', motherProfileId: props.motherProfileId, babyProfileId: babyId.value, autoExtract: extract })
    if (extract) {
      if (doc.value.extractStatus === 'NONE') doc.value = await careDocumentApi.extract(doc.value.id)
      startPolling(doc.value.id)
      message.success('照片已上传，AI 正在识别…')
    } else message.success('签字原件已上传，保存后生效')
  } finally {
    uploading.value = false
  }
}

async function retry() {
  if (!doc.value) return
  doc.value = await careDocumentApi.extract(doc.value.id)
  startPolling(doc.value.id)
}

// ---------------- 药品行 ----------------
const toggle = (i: number, key: 'route' | 'familySigned', v: string) => (items.value[i][key] = items.value[i][key] === v ? null : v)
function toggleTime(i: number, v: string) {
  const cur = items.value[i].times ?? []
  items.value[i].times = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
}
const itemSummary = (it: MedicationItem) =>
  `${it.drugName}${it.route ? '（' + MED_ROUTE_LABEL[it.route] : ''}${it.times?.length ? (it.route ? '·' : '（') + it.times.map((t) => MED_TIME_LABEL[t]).join('') : ''}${it.route || it.times?.length ? '）' : ''}`

async function save() {
  if (!babyId.value) return message.error('请选择宝宝')
  const rows = items.value.filter((it) => (it.drugName ?? '').trim())
  if (rows.length === 0) return message.error('请至少填写一种药品的药名')
  if (props.mode === 'change' && !changeNote.value.trim()) return message.error('请填写变更说明（相比上一份改了什么、为什么）')
  saving.value = true
  try {
    const hdr = { ...header.value }
    if (props.mode === 'create' || props.mode === 'change') {
      await careMedicationApi.create({
        babyProfileId: babyId.value,
        previousAuthId: props.mode === 'change' ? props.auth!.id : undefined,
        changeNote: props.mode === 'change' ? changeNote.value : undefined,
        documentId: doc.value?.id,
        header: hdr,
        items: rows,
      })
      message.success(props.mode === 'change' ? '已新签变更委托书，上一份已标为“已替换”' : '委托书已保存')
    } else {
      await careMedicationApi.update(props.auth!.id, {
        version: props.auth!.version,
        header: hdr,
        items: rows,
        ...(doc.value && doc.value.id !== props.auth!.documentId ? { documentId: doc.value.id } : {}),
      })
      message.success('已保存修改')
    }
    emit('saved')
    emit('update:show', false)
  } finally {
    saving.value = false
  }
}
const close = () => emit('update:show', false)
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v) => emit('update:show', v)">
    <n-card :title="title" style="width: min(1000px, 100vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="close">
      <template #header-extra>
        <n-tag v-if="auth && mode === 'view'" :type="auth.status === 'ACTIVE' ? 'success' : 'default'" size="small" round>
          {{ auth.status === 'ACTIVE' ? '有效' : auth.status === 'SUPERSEDED' ? '已替换' : '已停药' }}
        </n-tag>
      </template>

      <div v-if="specs">
        <!-- 宝宝 + 拍照 -->
        <div class="md-bar">
          <input ref="fileInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="onPick" />
          <n-space align="center" :wrap="true">
            <n-select v-if="mode === 'create' && babies.length > 1" v-model:value="babyId" :options="babies" size="small" style="width: 160px" placeholder="给哪个宝宝" />
            <span v-else-if="babyId" class="md-baby">👶 {{ babies.find((b) => b.value === babyId)?.label }}</span>
            <n-button v-if="!readonly" type="primary" size="small" :loading="uploading" :disabled="extracting" @click="fileInput?.click()">
              {{ mode === 'edit' ? '📷 补传家属签字的原件' : '📷 拍纸质委托书，AI 识别预填' }}
            </n-button>
            <n-button v-if="doc && !extracting && (mode === 'create' || mode === 'change')" size="small" @click="retry">重新识别</n-button>
            <span v-if="!readonly" class="md-tip">家属签好字的纸质委托书拍照保存，用来分清责任。</span>
          </n-space>
        </div>

        <n-alert v-if="mode === 'change' && auth" type="info" :bordered="false" style="margin-top: 8px">
          这是在原来那份（{{ auth.authDate?.slice(0, 10) }} 委托：{{ auth.items.map((i) => i.drugName).join('、') }}）基础上<b>新签一份</b>：保存后上一份自动变为“已替换”，两份都会完整保留。
          需要家属重新签字，并拍照上传新的纸质委托书。
        </n-alert>
        <n-alert v-if="extracting" type="info" :bordered="false" style="margin-top: 8px"><n-space align="center"><n-spin size="small" />AI 正在识别…</n-space></n-alert>
        <n-alert v-else-if="doc?.extractStatus === 'FAILED'" type="error" :bordered="false" style="margin-top: 8px">AI 识别失败：{{ doc.extractError }}，可点“重新识别”或手工填写。</n-alert>
        <n-alert v-else-if="doc?.extractStatus === 'DONE' && !readonly && (mode === 'create' || mode === 'change')" type="warning" :bordered="false" style="margin-top: 8px">
          AI 已预填。<b>请对照原图逐项核对</b>（标黄的是没把握的，共 {{ headerWarnCount }} 处表头 + 药品里的提示）；<b>点“保存”前不会写入。</b>
        </n-alert>

        <details v-if="doc && doc.files.length > 0" class="md-photo" :open="mode === 'view'">
          <summary>家属签字的纸质原件（点击放大）</summary>
          <CareDocImages :document-id="doc.id" :files="doc.files" :width="420" />
        </details>

        <h4 class="md-h">委托信息</h4>
        <SpecForm v-model="header" :spec="{ groups: [{ title: '', fields: specs.header }] }" :warnings="warnings" :readonly="readonly" />

        <h4 class="md-h">药品</h4>
        <div v-for="(it, i) in items" :key="i" class="md-item">
          <template v-if="readonly">
            <div class="md-name">{{ itemSummary(it) }}</div>
            <div class="md-sub">
              <span v-if="it.dose">剂量：{{ it.dose }}　</span>
              <span v-if="it.courseDays">疗程 {{ it.courseDays }} 天　</span>
              <span v-if="it.startDate || it.endDate">{{ it.startDate?.slice(0, 10) ?? '' }} ~ {{ it.endDate?.slice(0, 10) ?? '' }}　</span>
              <span v-if="it.familySigned === 'YES'">家长已签　</span>
              <span v-if="it.notes">注意事项：{{ it.notes }}</span>
            </div>
          </template>
          <template v-else>
            <div class="md-line">
              <label class="md-grow" :class="{ 'md-bad': warnOf(i, 'drugName') }"><span>药名</span><n-input v-model:value="it.drugName" size="small" placeholder="如 AD、护臀膏" /></label>
              <n-button v-if="items.length > 1" size="tiny" type="error" quaternary @click="items.splice(i, 1)">删除</n-button>
            </div>
            <div class="md-line">
              <n-button v-for="(label, k) in MED_ROUTE_LABEL" :key="k" size="small" :type="it.route === k ? 'primary' : 'default'" :secondary="it.route !== k" @click="toggle(i, 'route', k)">{{ label }}</n-button>
              <span class="md-sep">|</span>
              <n-button v-for="(label, k) in MED_TIME_LABEL" :key="k" size="small" :type="it.times?.includes(k) ? 'primary' : 'default'" :secondary="!it.times?.includes(k)" @click="toggleTime(i, k)">{{ label }}</n-button>
              <n-button size="small" :type="it.familySigned === 'YES' ? 'primary' : 'default'" :secondary="it.familySigned !== 'YES'" @click="toggle(i, 'familySigned', 'YES')">家长已签</n-button>
            </div>
            <div class="md-line">
              <label class="md-grow"><span>剂量</span><n-input v-model:value="it.dose" size="small" placeholder="如 1滴、2.5ml" /></label>
              <label class="md-w"><span>疗程(天)</span><n-input-number v-model:value="it.courseDays" :show-button="false" size="small" /></label>
            </div>
            <div class="md-line">
              <label class="md-w2"><span>开始日期</span><n-date-picker :value="toTs(it.startDate)" type="date" clearable size="small" @update:value="(v) => (it.startDate = fromTs(v))" /></label>
              <label class="md-w2"><span>结束日期</span><n-date-picker :value="toTs(it.endDate)" type="date" clearable size="small" @update:value="(v) => (it.endDate = fromTs(v))" /></label>
            </div>
            <div class="md-line">
              <label class="md-grow"><span>用药注意事项</span><n-input v-model:value="it.notes" size="small" placeholder="如 饭后半小时、间隔 4 小时" /></label>
            </div>
            <div v-for="k in ['drugName', 'route', 'times', 'notes', 'familySigned']" :key="k">
              <div v-if="warnOf(i, k)" class="md-msg">⚠ {{ warnOf(i, k) }}</div>
            </div>
          </template>
        </div>
        <n-button v-if="!readonly" dashed block @click="items.push(blankItem())">＋ 再加一种药</n-button>

        <div v-if="mode === 'change'" style="margin-top: 14px">
          <h4 class="md-h">变更说明（必填）</h4>
          <n-input v-model:value="changeNote" type="textarea" :autosize="{ minRows: 2 }" placeholder="相比上一份改了什么、为什么，如：医生调整，AD 改为每天两次" />
        </div>
        <div v-else-if="auth?.changeNote" style="margin-top: 14px; color: #6f6a62; font-size: 13px"><b>变更说明：</b>{{ auth.changeNote }}</div>
        <div v-if="auth?.status === 'STOPPED'" style="margin-top: 8px; color: #9a4f33; font-size: 13px"><b>已停药：</b>{{ auth.stoppedAt?.slice(0, 10) }}，{{ auth.stopNote }}</div>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="close">{{ readonly ? '关闭' : '取消' }}</n-button>
          <n-button v-if="!readonly" type="primary" :loading="saving" :disabled="extracting" @click="save">{{ mode === 'edit' ? '保存修改' : mode === 'change' ? '保存并替换上一份' : '保存委托书' }}</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.md-bar {
  padding-bottom: 8px;
  border-bottom: 1px dashed #e6e3d9;
}
.md-baby {
  font-weight: 600;
}
.md-tip {
  color: #86817a;
  font-size: 12px;
}
.md-photo {
  margin-top: 8px;
  font-size: 13px;
}
.md-photo summary {
  cursor: pointer;
  color: #5b83aa;
  margin-bottom: 6px;
}
.md-h {
  margin: 14px 0 8px;
  padding-left: 8px;
  border-left: 3px solid #c96f4f;
  font-size: 14px;
  color: #5b83aa;
}
.md-item {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #e6e3d9;
  border-radius: 8px;
  background: #fbfaf6;
}
.md-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  margin-top: 6px;
}
.md-item label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #6f6a62;
}
.md-grow {
  flex: 1 1 160px;
}
.md-w {
  width: 110px;
}
.md-w2 {
  flex: 1 1 140px;
}
.md-sep {
  color: #d6d2c8;
}
.md-name {
  font-weight: 600;
}
.md-sub {
  margin-top: 3px;
  color: #6f6a62;
  font-size: 13px;
}
.md-bad {
  background: #f4ecdf;
  border-radius: 4px;
  outline: 2px solid #c96f4f;
}
.md-msg {
  margin-top: 4px;
  font-size: 12px;
  color: #9a4f33;
}
:deep(.n-card__content) {
  max-height: 72vh;
  overflow: auto;
}
</style>
