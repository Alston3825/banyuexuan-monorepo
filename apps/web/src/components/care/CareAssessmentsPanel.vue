<script setup lang="ts">
/**
 * 母婴档案里的“入所评估”/“出所评估”标签页：
 * 妈妈一张（产妇入住评估单 / 妈妈出所健康评估表），每个宝宝一张（新生儿入所评估 / 宝宝出所健康评估表）。
 * 每张表单次评估，一个档案一份；没建的显示“去录入”，已建的可查看/修改，并能看到纸质原件。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NSpace, NSpin, NTag } from 'naive-ui'
import { careAssessmentApi, careDocumentApi } from '../../api/modules/care-archive.api'
import { CARE_DOC_TYPE_LABEL, type AssessmentOverview, type AssessmentRecord, type AssessmentType, type CareDocument, type FormSpec } from '../../api/types/care-archive'
import { dialog, message } from '../../utils/discrete-api'
import { BABY_GENDER_LABEL_MAP } from '../../utils/status-map'
import AssessmentDialog from './AssessmentDialog.vue'

const props = defineProps<{ motherProfileId: string; stage: 'admission' | 'discharge' }>()
const emit = defineEmits<{ changed: [] }>()

const specs = ref<FormSpec[]>([])
const overview = ref<AssessmentOverview | null>(null)
const loading = ref(false)
const allDocs = ref<CareDocument[]>([])

const dlg = ref({ show: false, spec: null as FormSpec | null, profileId: '', subjectLabel: '', record: null as AssessmentRecord | null, draft: null as CareDocument | null })

const specOf = (t: AssessmentType) => specs.value.find((s) => s.type === t) ?? null
const motherType = computed<AssessmentType>(() => (props.stage === 'admission' ? 'MOTHER_ADMISSION' : 'MOTHER_DISCHARGE'))
const babyType = computed<AssessmentType>(() => (props.stage === 'admission' ? 'BABY_ADMISSION' : 'BABY_DISCHARGE'))
const motherRecord = computed(() => (props.stage === 'admission' ? overview.value?.motherAdmission : overview.value?.motherDischarge) ?? null)

async function load() {
  loading.value = true
  try {
    ;[specs.value, overview.value, allDocs.value] = await Promise.all([
      specs.value.length ? Promise.resolve(specs.value) : careAssessmentApi.specs(),
      careAssessmentApi.overview(props.motherProfileId),
      careDocumentApi.list({ motherProfileId: props.motherProfileId }),
    ])
  } finally {
    loading.value = false
  }
}

async function open(type: AssessmentType, profileId: string, subjectLabel: string, record: AssessmentRecord | null, draft: CareDocument | null = null) {
  // 从别的标签页“继续复核”跳过来时，字段说明书可能还没加载完，先等它
  if (specs.value.length === 0) await load()
  dlg.value = { show: true, spec: specOf(type), profileId, subjectLabel, record, draft }
}

/** 已上传照片、还没复核入库的草稿（拍完照关掉了页面/识别失败/还在核对中） */
const drafts = computed(() => allDocs.value.filter((d) => d.status === 'DRAFT' && (d.docType === motherType.value || d.docType === babyType.value)))
const draftLabel = (d: CareDocument) => {
  const baby = d.babyProfileId ? overview.value?.babies.find((b) => b.baby.id === d.babyProfileId) : null
  return `${CARE_DOC_TYPE_LABEL[d.docType]}${baby ? ' — ' + babyLabel(baby.baby) : ''}`
}
const extractText: Record<string, string> = { PENDING: 'AI 识别排队中', RUNNING: 'AI 识别中', DONE: 'AI 已识别，待核对', FAILED: 'AI 识别失败，可重试或手工填写', NONE: '' }
function resume(d: CareDocument) {
  const isBaby = d.docType === 'BABY_ADMISSION' || d.docType === 'BABY_DISCHARGE'
  const baby = isBaby ? overview.value?.babies.find((b) => b.baby.id === d.babyProfileId) : null
  open(d.docType as AssessmentType, isBaby ? d.babyProfileId! : props.motherProfileId, baby ? babyLabel(baby.baby) : '', null, d)
}
function removeDraft(d: CareDocument) {
  dialog.warning({
    title: '删除这份未入库的草稿？',
    content: '只会删除这次上传的照片和识别结果，不影响已入库的数据。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await careDocumentApi.remove(d.id)
      message.success('已删除')
      await load()
    },
  })
}

const dateText = (r: AssessmentRecord) => String(r.assessedAt ?? r.createdAt ?? '').slice(0, 10) || '-'
const babyLabel = (b: AssessmentOverview['babies'][number]['baby']) =>
  `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}（${BABY_GENDER_LABEL_MAP[b.gender] ?? b.gender}）`

async function afterSaved() {
  await load()
  emit('changed')
}

defineExpose({ reload: load, open })
onMounted(load)
</script>

<template>
  <n-spin :show="loading">
    <n-space vertical :size="14">
      <n-card v-if="drafts.length > 0" size="small" title="有已上传、还没入库的纸质表格" style="border-color: #f0a020">
        <n-space vertical :size="8">
          <div v-for="d in drafts" :key="d.id" class="ap-draft">
            <div class="ap-draft-title">
              {{ draftLabel(d) }}<span class="ap-draft-sub">{{ new Date(d.createdAt).toLocaleString('zh-CN', { hour12: false }) }} · {{ extractText[d.extractStatus] }}</span>
            </div>
            <n-space :size="6">
              <n-button size="small" type="primary" @click="resume(d)">继续核对入库</n-button>
              <n-button size="small" type="error" ghost @click="removeDraft(d)">删除</n-button>
            </n-space>
          </div>
        </n-space>
      </n-card>

      <n-card size="small" :title="specOf(motherType)?.title ?? ''">
        <template #header-extra>
          <n-tag v-if="motherRecord" type="success" size="small" round>已入库 · {{ dateText(motherRecord) }}</n-tag>
          <n-tag v-else size="small" round>未录入</n-tag>
        </template>
        <n-space align="center" :wrap="true">
          <span style="color: #666">妈妈本人</span>
          <n-button v-if="!motherRecord" type="primary" size="small" @click="open(motherType, motherProfileId, '', null)">去录入（可拍照识别）</n-button>
          <template v-else>
            <n-button size="small" @click="open(motherType, motherProfileId, '', motherRecord)">查看 / 修改</n-button>
            <span v-if="motherRecord.document" style="color: #888; font-size: 12px">已归档原件 {{ motherRecord.document.files.length }} 张</span>
            <span v-else style="color: #b25e00; font-size: 12px">未上传纸质原件</span>
          </template>
        </n-space>
      </n-card>

      <n-card v-for="b in overview?.babies ?? []" :key="b.baby.id" size="small" :title="`${specOf(babyType)?.title ?? ''} — ${babyLabel(b.baby)}`">
        <template #header-extra>
          <n-tag v-if="(stage === 'admission' ? b.admission : b.discharge)" type="success" size="small" round>
            已入库 · {{ dateText((stage === 'admission' ? b.admission : b.discharge)!) }}
          </n-tag>
          <n-tag v-else size="small" round>未录入</n-tag>
        </template>
        <n-space align="center" :wrap="true">
          <n-button
            v-if="!(stage === 'admission' ? b.admission : b.discharge)"
            type="primary"
            size="small"
            @click="open(babyType, b.baby.id, babyLabel(b.baby), null)"
          >
            去录入（可拍照识别）
          </n-button>
          <template v-else>
            <n-button size="small" @click="open(babyType, b.baby.id, babyLabel(b.baby), (stage === 'admission' ? b.admission : b.discharge)!)">查看 / 修改</n-button>
            <span v-if="(stage === 'admission' ? b.admission : b.discharge)!.document" style="color: #888; font-size: 12px">
              已归档原件 {{ (stage === 'admission' ? b.admission : b.discharge)!.document!.files.length }} 张
            </span>
            <span v-else style="color: #b25e00; font-size: 12px">未上传纸质原件</span>
          </template>
        </n-space>
      </n-card>
      <n-empty v-if="overview && overview.babies.length === 0" description="还没有宝宝档案，请先在“概览”里新增宝宝，再录入宝宝的评估表" />
    </n-space>

    <AssessmentDialog
      v-model:show="dlg.show"
      :spec="dlg.spec"
      :profile-id="dlg.profileId"
      :mother-profile-id="motherProfileId"
      :subject-label="dlg.subjectLabel"
      :record="dlg.record"
      :draft="dlg.draft"
      @saved="afterSaved"
    />
  </n-spin>
</template>

<style scoped>
.ap-draft {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.ap-draft-title {
  font-size: 14px;
}
.ap-draft-sub {
  display: block;
  color: #888;
  font-size: 12px;
}
</style>
