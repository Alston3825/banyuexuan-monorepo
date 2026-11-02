<script setup lang="ts">
/**
 * 核对一份满意度调查：左边（手机上在上面）是纸质表原图，右边是识别出的内容——
 * 每个评分项是 0~12 的一排小按钮（纸上打勾的那一格），可以直接点选改；点已选中的分值＝清空。
 * 核对无误后点“确认并计入统计”，确认前的调查不会进统计。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDatePicker, NForm, NFormItem, NInput, NModal, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { satisfactionApi } from '../../api/modules/satisfaction.api'
import { customerApi } from '../../api/modules/customer.api'
import type { Survey, SurveyFormSpec, SurveySpecs } from '../../api/types/satisfaction'
import { dialog, message } from '../../utils/discrete-api'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{ show: boolean; surveyId: string | null; specs: SurveySpecs | null }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'changed'): void }>()

const auth = useAuthStore()
const canEdit = computed(() => auth.hasAccess('satisfaction.survey.update'))
const survey = ref<Survey | null>(null)
const loading = ref(false)
const saving = ref(false)
const images = ref<{ id: string; url: string; pdf: boolean }[]>([])
const customers = ref<{ label: string; value: string }[]>([])
let timer: ReturnType<typeof setTimeout> | null = null

const spec = computed<SurveyFormSpec | undefined>(() => props.specs?.templates.find((f) => f.id === survey.value?.templateId))
const locked = computed(() => survey.value?.status === 'CONFIRMED' || !canEdit.value)

// 表单草稿（本地编辑，保存时一起提交）
const f = ref({ customerId: null as string | null, customerName: '', roomNo: '', stewardName: '', nurseName: '', phone: '', surveyDate: null as number | null, suggestion: '', praise: '' })
const scores = ref<Record<string, number>>({})
const warnFields = computed(() => new Set((survey.value?.extractWarnings ?? []).map((w) => w.field)))
const warnOf = (k: string) => (survey.value?.extractWarnings ?? []).find((w) => w.field === k)?.message

const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fill(s: Survey) {
  survey.value = s
  f.value = {
    customerId: s.customerId,
    customerName: s.customerName ?? '',
    roomNo: s.roomNo ?? '',
    stewardName: s.stewardName ?? '',
    nurseName: s.nurseName ?? '',
    phone: s.phone ?? '',
    surveyDate: s.surveyDate ? new Date(s.surveyDate.slice(0, 10) + 'T00:00:00').getTime() : null,
    suggestion: s.suggestion ?? '',
    praise: s.praise ?? '',
  }
  scores.value = { ...(s.scores ?? {}) }
}

async function loadImages(s: Survey) {
  images.value.forEach((i) => URL.revokeObjectURL(i.url))
  images.value = await Promise.all(s.files.map(async (file) => ({ id: file.id, pdf: file.mimeType === 'application/pdf', url: URL.createObjectURL(await satisfactionApi.fileBlob(s.id, file.id)) })))
}

async function load(first = false) {
  if (!props.surveyId) return
  if (first) loading.value = true
  try {
    const s = await satisfactionApi.get(props.surveyId)
    const wasRunning = survey.value?.extractStatus === 'PENDING' || survey.value?.extractStatus === 'RUNNING'
    if (first || wasRunning || !survey.value) fill(s)
    else survey.value = { ...survey.value, extractStatus: s.extractStatus, extractError: s.extractError, extractWarnings: s.extractWarnings }
    if (first) await loadImages(s)
    if (s.extractStatus === 'PENDING' || s.extractStatus === 'RUNNING') timer = setTimeout(() => void load(), 3000)
    else if (wasRunning) emit('changed')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.show, props.surveyId] as const,
  async ([show]) => {
    if (timer) clearTimeout(timer)
    if (!show) return
    survey.value = null
    images.value = []
    await load(true)
    if (customers.value.length === 0) {
      const list = await customerApi.list()
      customers.value = list.map((c) => ({ label: `${c.name}（${c.phone ?? ''}）`, value: c.id }))
    }
  },
)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  images.value.forEach((i) => URL.revokeObjectURL(i.url))
})

function pick(key: string, v: number) {
  if (locked.value) return
  if (scores.value[key] === v) {
    const { [key]: _, ...rest } = scores.value
    scores.value = rest
  } else scores.value = { ...scores.value, [key]: v }
}
const scoreType = (v: number) => (v >= (props.specs?.satisfiedMin ?? 10) ? 'success' : v <= (props.specs?.unsatisfiedMax ?? 6) ? 'error' : 'warning')

function body() {
  const all: Record<string, number | null> = {}
  for (const g of spec.value?.groups ?? []) for (const it of g.items) all[it.key] = scores.value[it.key] ?? null
  return {
    customerId: f.value.customerId,
    customerName: f.value.customerName,
    roomNo: f.value.roomNo,
    stewardName: f.value.stewardName,
    nurseName: f.value.nurseName,
    phone: f.value.phone,
    surveyDate: f.value.surveyDate ? ymd(f.value.surveyDate) : null,
    scores: all,
    suggestion: f.value.suggestion,
    praise: f.value.praise,
  }
}
async function save(): Promise<boolean> {
  if (!survey.value) return false
  saving.value = true
  try {
    survey.value = { ...(await satisfactionApi.update(survey.value.id, body())), extractWarnings: survey.value.extractWarnings }
    emit('changed')
    return true
  } finally {
    saving.value = false
  }
}
async function onSave() {
  if (await save()) message.success('已保存')
}
async function onConfirm() {
  if (!survey.value || !(await save())) return
  saving.value = true
  try {
    fill(await satisfactionApi.confirm(survey.value.id))
    message.success('已确认，计入统计')
    emit('changed')
    emit('update:show', false)
  } finally {
    saving.value = false
  }
}
function onUnconfirm() {
  if (!survey.value) return
  dialog.warning({
    title: '撤回确认',
    content: '撤回后这份调查不再计入统计，修改完要再次确认。',
    positiveText: '撤回',
    negativeText: '取消',
    onPositiveClick: async () => {
      fill(await satisfactionApi.unconfirm(survey.value!.id))
      emit('changed')
    },
  })
}
async function onReextract() {
  if (!survey.value) return
  survey.value = await satisfactionApi.extract(survey.value.id)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void load(), 3000)
}
const uploading = ref(false)
async function onAddFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || !survey.value) return
  uploading.value = true
  try {
    const s = await satisfactionApi.addFiles(survey.value.id, files)
    survey.value = { ...survey.value, files: s.files }
    await loadImages(s)
  } finally {
    uploading.value = false
  }
}
const running = computed(() => survey.value?.extractStatus === 'PENDING' || survey.value?.extractStatus === 'RUNNING')
</script>

<template>
  <n-modal :mask-closable="false" :show="show" @update:show="(v: boolean) => emit('update:show', v)">
    <n-card :title="survey ? `${spec?.name ?? '满意度调查'}${spec?.day ? `（住满第 ${spec.day} 天）` : ''}` : '满意度调查'" style="width: min(1180px, 98vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true" closable @close="emit('update:show', false)">
      <n-spin :show="loading">
        <div v-if="survey" class="sv-wrap">
          <!-- 原图 -->
          <div class="sv-photos">
            <div v-if="images.length === 0" class="sv-nophoto">没有上传照片（手工录入）</div>
            <template v-for="img in images" :key="img.id">
              <a v-if="!img.pdf" :href="img.url" target="_blank" title="点击在新窗口看大图"><img :src="img.url" alt="纸质调查表" /></a>
              <a v-else :href="img.url" target="_blank">打开 PDF</a>
            </template>
            <label v-if="canEdit && !locked" class="sv-add">
              <input type="file" accept="image/*,.heic,.heif,application/pdf" multiple hidden @change="onAddFiles" />
              <n-button size="small" :loading="uploading" tag="span">＋ 补传照片</n-button>
            </label>
          </div>

          <!-- 识别结果 / 核对 -->
          <div class="sv-form">
            <n-alert v-if="running" type="info" :bordered="false" style="margin-bottom: 10px"><n-spin size="small" /> 正在识别纸质表，几十秒后自动出结果，请稍候…</n-alert>
            <n-alert v-else-if="survey.extractStatus === 'FAILED'" type="error" :bordered="false" style="margin-bottom: 10px">
              识别失败：{{ survey.extractError }}
              <n-button size="tiny" style="margin-left: 8px" @click="onReextract">重新识别</n-button>
            </n-alert>
            <n-alert v-else-if="survey.extractStatus === 'DONE' && survey.status === 'DRAFT'" type="warning" :bordered="false" style="margin-bottom: 10px">
              以下是 AI 读图的结果，<b>请对照左边原图逐项核对</b>（黄色底的是没读出来或没把握的），改好后点“确认并计入统计”。
              <n-button size="tiny" style="margin-left: 8px" @click="onReextract">重新识别</n-button>
            </n-alert>
            <n-tag v-if="survey.status === 'CONFIRMED'" type="success" style="margin-bottom: 10px">已确认，计入统计</n-tag>

            <n-form label-placement="top" size="small" :disabled="locked">
              <div class="sv-head">
                <n-form-item label="对应客户">
                  <n-select v-model:value="f.customerId" :options="customers" filterable clearable placeholder="搜索客户姓名/手机号" @update:value="(v: string | null) => { const c = customers.find((x) => x.value === v); if (c && !f.customerName) f.customerName = c.label.split('（')[0] }" />
                </n-form-item>
                <n-form-item label="纸上客户姓名" :class="{ 'sv-warn': warnFields.has('customerName') }" :feedback="warnOf('customerName')"><n-input v-model:value="f.customerName" /></n-form-item>
                <n-form-item label="房号"><n-input v-model:value="f.roomNo" /></n-form-item>
                <n-form-item label="管家姓名"><n-input v-model:value="f.stewardName" /></n-form-item>
                <n-form-item label="责任护士"><n-input v-model:value="f.nurseName" /></n-form-item>
                <n-form-item label="填写日期" :class="{ 'sv-warn': warnFields.has('surveyDate') }" :feedback="warnOf('surveyDate')"><n-date-picker v-model:value="f.surveyDate" type="date" clearable style="width: 100%" /></n-form-item>
              </div>
            </n-form>

            <div class="sv-scale"><span>← 非常满意（{{ spec?.goodWord }}）= {{ specs?.scoreMax }} 分</span><span>0 分 = 非常不满意（{{ spec?.badWord }}）→</span></div>
            <template v-for="g in spec?.groups" :key="g.key">
              <div class="sv-gtitle">{{ g.title }}</div>
              <div v-for="(it, i) in g.items" :key="it.key" class="sv-item" :class="{ 'sv-warn': warnFields.has(it.key) && scores[it.key] === undefined }">
                <div class="sv-ilabel">{{ i + 1 }}. {{ it.label }}</div>
                <div class="sv-btns">
                  <button v-for="v in Array.from({ length: (specs?.scoreMax ?? 12) + 1 }, (_, k) => (specs?.scoreMax ?? 12) - k)" :key="v" type="button" class="sv-btn" :class="[scores[it.key] === v ? 'on-' + scoreType(v) : '', locked ? 'ro' : '']" @click="pick(it.key, v)">{{ v }}</button>
                </div>
              </div>
            </template>

            <n-form label-placement="top" size="small" :disabled="locked" style="margin-top: 10px">
              <n-form-item :label="spec?.suggestionLabel"><n-input v-model:value="f.suggestion" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }" placeholder="没有可不填" /></n-form-item>
              <n-form-item :label="spec?.praiseLabel"><n-input v-model:value="f.praise" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" placeholder="没有可不填" /></n-form-item>
            </n-form>
          </div>
        </div>
      </n-spin>
      <template #footer>
        <n-space justify="end">
          <n-button @click="emit('update:show', false)">关闭</n-button>
          <template v-if="canEdit && survey">
            <n-button v-if="survey.status === 'CONFIRMED'" @click="onUnconfirm">撤回确认（修改）</n-button>
            <template v-else>
              <n-button :loading="saving" :disabled="running" @click="onSave">保存</n-button>
              <n-button type="primary" :loading="saving" :disabled="running" @click="onConfirm">确认并计入统计</n-button>
            </template>
          </template>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.sv-wrap {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 16px;
  align-items: start;
}
.sv-photos img {
  width: 100%;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  margin-bottom: 8px;
}
.sv-nophoto {
  color: #999;
  padding: 24px 0;
  text-align: center;
}
.sv-head {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0 10px;
}
.sv-scale {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #888;
  margin: 4px 0;
}
.sv-gtitle {
  font-weight: 700;
  margin: 10px 0 4px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.14);
}
.sv-item {
  padding: 6px 4px 8px;
  border-bottom: 1px dashed rgba(128, 128, 128, 0.25);
}
.sv-ilabel {
  margin-bottom: 4px;
  font-size: 14px;
}
.sv-btns {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
  gap: 3px;
}
@media (max-width: 900px) {
  .sv-btns {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 5px;
  }
  .sv-btn {
    height: 38px !important;
  }
}
.sv-btn {
  min-width: 0;
  height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
}
.sv-btn.ro {
  cursor: default;
}
.sv-btn.on-success {
  background: #18a058;
  border-color: #18a058;
  color: #fff;
  font-weight: 700;
}
.sv-btn.on-warning {
  background: #f0a020;
  border-color: #f0a020;
  color: #fff;
  font-weight: 700;
}
.sv-btn.on-error {
  background: #d03050;
  border-color: #d03050;
  color: #fff;
  font-weight: 700;
}
.sv-warn {
  background: rgba(240, 160, 32, 0.16);
  border-radius: 6px;
}
</style>
