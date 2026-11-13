<script setup lang="ts">
/**
 * 评估表录入/复核/查看弹窗（四张单次评估表共用，字段由说明书自动生成）。
 *
 * 新建：可以 ① 拍照/选照片 → AI 自动识别并填好表单（标黄的是没把握的）→ 人工逐项核对 → 确认入库；
 *       也可以 ② 不拍照直接手工填写（保存后还能补传原件照片）。
 * 已有：先只读查看，点“修改”进入编辑；左边始终显示原件照片，方便对照。
 * 识别结果只是草稿，点“确认入库”之前不会写进评估表（不会进入统计）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NModal, NSpace, NSpin, NTag } from 'naive-ui'
import { careAssessmentApi, careDocumentApi } from '../../api/modules/care-archive.api'
import type { AssessmentRecord, CareDocument, ExtractWarning, FormSpec } from '../../api/types/care-archive'
import { message } from '../../utils/discrete-api'
import CareDocImages from './CareDocImages.vue'
import SpecForm from './SpecForm.vue'

const props = defineProps<{
  show: boolean
  spec: FormSpec | null
  /** 妈妈档案 id（产妇类）或宝宝档案 id（宝宝类） */
  profileId: string
  motherProfileId: string
  /** 弹窗标题里的补充，如“宝宝A” */
  subjectLabel?: string
  /** 已有的评估记录；没有则是新建 */
  record: AssessmentRecord | null
  /** 继续复核一份已上传、还没入库的草稿资料 */
  draft?: CareDocument | null
}>()
const emit = defineEmits<{ 'update:show': [value: boolean]; saved: [] }>()

const values = ref<Record<string, unknown>>({})
const warnings = ref<ExtractWarning[]>([])
const doc = ref<CareDocument | null>(null)
const editing = ref(false)
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const isNew = computed(() => !props.record)
const title = computed(() => `${props.spec?.title ?? ''}${props.subjectLabel ? ' — ' + props.subjectLabel : ''}`)
const extracting = computed(() => doc.value?.extractStatus === 'PENDING' || doc.value?.extractStatus === 'RUNNING')
const warnCount = computed(() => warnings.value.filter((w) => w.level !== 'info').length)

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

/** 把识别结果填进表单（只用于新建时） */
function applyExtraction(d: CareDocument) {
  values.value = { ...(d.extractData ?? {}) }
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
        if (isNew.value) applyExtraction(d)
        message.success('AI 已识别完成，请对照原图逐项核对')
      } else if (d.extractStatus === 'FAILED') {
        stopPolling()
        message.error(`AI 识别失败：${d.extractError ?? '未知原因'}，可以重试或手工填写`)
      } else if (Date.now() - started > 6 * 60_000) {
        stopPolling()
      }
    } catch {
      /* 偶发网络错误，下一轮再试 */
    }
  }, 2500)
}

function init() {
  stopPolling()
  doc.value = null
  warnings.value = []
  if (props.record) {
    values.value = { ...props.record }
    editing.value = false
    if (props.record.document) {
      careDocumentApi.get(props.record.document.id).then((d) => (doc.value = d))
    }
  } else {
    values.value = {}
    editing.value = true
    if (props.draft) {
      doc.value = props.draft
      if (props.draft.extractStatus === 'DONE') applyExtraction(props.draft)
      else if (props.draft.extractStatus === 'PENDING' || props.draft.extractStatus === 'RUNNING') startPolling(props.draft.id)
    }
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

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0 || !props.spec) return
  uploading.value = true
  try {
    const isBaby = props.spec.subject === 'BABY'
    const meta = {
      docType: props.spec.type,
      motherProfileId: props.motherProfileId,
      babyProfileId: isBaby ? props.profileId : undefined,
      // 新建时：上传后马上识别；已有记录补传原件：只留档不识别
      autoExtract: isNew.value,
    }
    if (doc.value) {
      doc.value = await careDocumentApi.addFiles(doc.value.id, files)
      if (isNew.value) {
        doc.value = await careDocumentApi.extract(doc.value.id)
        startPolling(doc.value.id)
      }
    } else {
      doc.value = await careDocumentApi.upload(files, meta)
      if (isNew.value) startPolling(doc.value.id)
    }
    message.success(isNew.value ? '照片已上传，AI 正在识别…' : '原件照片已上传')
  } finally {
    uploading.value = false
  }
}

async function retryExtract() {
  if (!doc.value) return
  doc.value = await careDocumentApi.extract(doc.value.id)
  startPolling(doc.value.id)
}

async function save() {
  if (!props.spec) return
  saving.value = true
  try {
    const clean: Record<string, unknown> = {}
    for (const g of props.spec.groups) for (const f of g.fields) clean[f.key] = values.value[f.key] ?? null
    if (props.record) {
      await careAssessmentApi.update(props.spec.type, props.record.id, {
        version: props.record.version,
        values: clean,
        ...(doc.value && doc.value.id !== props.record.documentId ? { documentId: doc.value.id } : {}),
      })
      message.success('已保存修改')
    } else {
      await careAssessmentApi.create(props.spec.type, { profileId: props.profileId, documentId: doc.value?.id, values: clean })
      message.success('已确认入库')
    }
    emit('saved')
    emit('update:show', false)
  } finally {
    saving.value = false
  }
}

function close() {
  emit('update:show', false)
}
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v) => emit('update:show', v)">
    <n-card :title="title" style="width: min(1320px, 97vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="close">
      <template #header-extra>
        <n-space>
          <n-tag v-if="record && !editing" type="success" size="small" round>已入库</n-tag>
          <n-tag v-else-if="isNew" type="warning" size="small" round>新建（尚未入库）</n-tag>
        </n-space>
      </template>

      <!-- 拍照识别区 -->
      <div class="ad-bar">
        <input ref="fileInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="onPick" />
        <n-space align="center" :wrap="true">
          <n-button v-if="editing || isNew" type="primary" :loading="uploading" :disabled="extracting" @click="fileInput?.click()">
            {{ doc ? '再补传几张照片' : isNew ? '📷 拍照 / 上传纸质表格，AI 自动识别' : '📷 上传纸质原件照片' }}
          </n-button>
          <n-button v-if="!doc && isNew" quaternary disabled>或者直接在下面手工填写</n-button>
          <n-button v-if="doc && isNew && !extracting" size="small" @click="retryExtract">重新识别</n-button>
          <span v-if="isNew && !doc" class="ad-tip">多页表格请一次选多张；苹果手机照片（HEIC）可直接上传。</span>
        </n-space>
      </div>

      <n-alert v-if="extracting" type="info" :bordered="false" style="margin: 10px 0">
        <n-space align="center"><n-spin size="small" />AI 正在识别纸质表格，一般 10～30 秒，请稍候（可以先对照原图看看）…</n-space>
      </n-alert>
      <n-alert v-else-if="doc?.extractStatus === 'FAILED' && isNew" type="error" :bordered="false" style="margin: 10px 0">
        AI 识别失败：{{ doc.extractError }}。可以点“重新识别”，或直接手工填写。
      </n-alert>
      <n-alert v-else-if="doc?.extractStatus === 'DONE' && isNew" type="warning" :bordered="false" style="margin: 10px 0">
        AI 已按原图预填。<b>请对照原图逐项核对</b>，<template v-if="warnCount > 0">其中 <b>{{ warnCount }}</b> 项标黄（AI 没把握），</template>
        确认无误后点底部“确认入库”——<b>点击之前数据不会进入统计</b>。
      </n-alert>

      <div class="ad-body" :class="{ 'ad-has-doc': !!doc && doc.files.length > 0 }">
        <div v-if="doc && doc.files.length > 0" class="ad-photos">
          <div class="ad-photos-title">纸质原件（点击放大）</div>
          <CareDocImages :document-id="doc.id" :files="doc.files" :width="420" />
        </div>
        <div class="ad-form">
          <SpecForm v-if="spec" v-model="values" :spec="spec" :warnings="warnings" :readonly="!editing" />
        </div>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="close">{{ editing ? '取消' : '关闭' }}</n-button>
          <n-button v-if="!editing && record" type="primary" @click="editing = true">修改</n-button>
          <n-button v-if="editing" type="primary" :loading="saving" :disabled="extracting" @click="save">
            {{ isNew ? '确认入库' : '保存修改' }}
          </n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.ad-bar {
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--c-e5e5e5);
}
.ad-tip {
  color: var(--c-999999);
  font-size: 12px;
}
.ad-body {
  display: block;
  max-height: 68vh;
  overflow: auto;
  padding-top: 10px;
}
.ad-has-doc {
  display: grid;
  grid-template-columns: 440px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.ad-photos {
  position: sticky;
  top: 0;
}
.ad-photos-title {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--c-888888);
}
@media (max-width: 900px) {
  .ad-has-doc {
    grid-template-columns: 1fr;
  }
  .ad-photos {
    position: static;
  }
}
</style>
