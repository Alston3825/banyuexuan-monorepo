<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  NCard,
  NSpace,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NRadioGroup,
  NRadio,
  NDatePicker,
  NSwitch,
  NTag,
  NEmpty,
  NDivider,
  type DataTableColumns,
} from 'naive-ui'
import {
  babyProfileApi,
  careAbnormalityApi,
  careFormTemplateApi,
  carePlanApi,
  carePlanTemplateApi,
  careRecordApi,
  motherProfileApi,
} from '../../api/modules/care.api'
import { tagApi } from '../../api/modules/tag.api'
import type {
  BabyProfile,
  BabyProfileInput,
  CareAbnormality,
  CareFormTemplate,
  CarePlan,
  CarePlanTask,
  CarePlanTemplate,
  CareRecord,
  CareTargetType,
  MotherProfile,
  TagBinding,
} from '../../api/types/care'
import type { Tag } from '../../api/types/tag'
import {
  renderStatusBadge,
  CARE_ABNORMALITY_STATUS_MAP,
  CARE_PLAN_STATUS_MAP,
  CARE_PLAN_TASK_STATUS_MAP,
  DELIVERY_METHOD_LABEL_MAP,
  BABY_GENDER_LABEL_MAP,
} from '../../utils/status-map'
import { message } from '../../utils/discrete-api'
import CareAbnormalityFollowUps from '../../components/care/CareAbnormalityFollowUps.vue'
import AiCareAbnormalitySuggestion from '../../components/ai/AiCareAbnormalitySuggestion.vue'

const route = useRoute()
const motherProfileId = route.params.id as string

const mother = ref<MotherProfile | null>(null)
const motherRiskTags = ref<TagBinding[]>([])
const babyRiskTags = ref<Record<string, TagBinding[]>>({})
const allTags = ref<Tag[]>([])
const allPlanTemplates = ref<CarePlanTemplate[]>([])
const allFormTemplates = ref<CareFormTemplate[]>([])
const plans = ref<CarePlan[]>([])
const abnormalities = ref<CareAbnormality[]>([])
const loading = ref(false)

const tagOptions = computed(() => allTags.value.map((t) => ({ label: t.name, value: t.id })))

/** "对象"选择器统一选项：妈妈本人 + 每个宝宝，value 用 "MOTHER:<id>" / "BABY:<id>" 编码，避免维护两套并行状态。 */
const targetOptions = computed(() => {
  if (!mother.value) return []
  const opts = [{ label: '妈妈本人', value: `MOTHER:${mother.value.id}` }]
  for (const b of mother.value.babies) {
    opts.push({ label: `宝宝${b.sequenceNo}${b.name ? `（${b.name}）` : ''}`, value: `BABY:${b.id}` })
  }
  return opts
})

function parseTargetKey(key: string | null): { type: CareTargetType; id: string } | null {
  if (!key) return null
  const [type, id] = key.split(':')
  return { type: type as CareTargetType, id }
}

function targetLabel(plan: CarePlan | CareAbnormality): string {
  if (plan.motherProfileId) return '妈妈本人'
  const baby = mother.value?.babies.find((b) => b.id === plan.babyProfileId)
  return baby ? `宝宝${baby.sequenceNo}${baby.name ? `（${baby.name}）` : ''}` : '-'
}

async function fetchAll() {
  loading.value = true
  try {
    mother.value = await motherProfileApi.get(motherProfileId)
    const [riskTags, tags, planTemplates, formTemplates] = await Promise.all([
      motherProfileApi.riskTags(motherProfileId),
      tagApi.list(),
      carePlanTemplateApi.list(),
      careFormTemplateApi.list(),
    ])
    motherRiskTags.value = riskTags
    allTags.value = tags
    allPlanTemplates.value = planTemplates
    allFormTemplates.value = formTemplates

    const babyTagEntries = await Promise.all(mother.value.babies.map((b) => babyProfileApi.riskTags(b.id).then((rt) => [b.id, rt] as const)))
    babyRiskTags.value = Object.fromEntries(babyTagEntries)

    const planLists = await Promise.all([
      carePlanApi.list({ motherProfileId }),
      ...mother.value.babies.map((b) => carePlanApi.list({ babyProfileId: b.id })),
    ])
    plans.value = planLists.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const abnormalityLists = await Promise.all([
      careAbnormalityApi.list({ motherProfileId }),
      ...mother.value.babies.map((b) => careAbnormalityApi.list({ babyProfileId: b.id })),
    ])
    abnormalities.value = abnormalityLists.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } finally {
    loading.value = false
  }
}

// ---------------- 编辑妈妈档案 ----------------
const editVisible = ref(false)
const editSubmitting = ref(false)
const editModel = ref({
  deliveryMethod: 'UNKNOWN' as MotherProfile['deliveryMethod'],
  deliveryDate: null as number | null,
  gestationalWeeks: null as number | null,
  expectedDeliveryDate: null as number | null,
  remark: '',
})

function openEdit() {
  if (!mother.value) return
  editModel.value = {
    deliveryMethod: mother.value.deliveryMethod,
    deliveryDate: mother.value.deliveryDate ? new Date(mother.value.deliveryDate).getTime() : null,
    gestationalWeeks: mother.value.gestationalWeeks,
    expectedDeliveryDate: mother.value.expectedDeliveryDate ? new Date(mother.value.expectedDeliveryDate).getTime() : null,
    remark: mother.value.remark ?? '',
  }
  editVisible.value = true
}

async function handleEditSubmit() {
  if (!mother.value) return
  editSubmitting.value = true
  try {
    await motherProfileApi.update(mother.value.id, {
      deliveryMethod: editModel.value.deliveryMethod,
      deliveryDate: editModel.value.deliveryDate ? new Date(editModel.value.deliveryDate).toISOString() : undefined,
      gestationalWeeks: editModel.value.gestationalWeeks ?? undefined,
      expectedDeliveryDate: editModel.value.expectedDeliveryDate ? new Date(editModel.value.expectedDeliveryDate).toISOString() : undefined,
      remark: editModel.value.remark || undefined,
      version: mother.value.version,
    })
    message.success('妈妈档案已更新')
    editVisible.value = false
    await fetchAll()
  } finally {
    editSubmitting.value = false
  }
}

// ---------------- 宝宝档案：新增/编辑 ----------------
const babyVisible = ref(false)
const babySubmitting = ref(false)
const editingBaby = ref<BabyProfile | null>(null)
const babyModel = ref<BabyProfileInput>({ name: '', gender: 'UNKNOWN', birthWeightGrams: undefined, apgarScore: '', remark: '', riskTagIds: [] })

function openAddBaby() {
  editingBaby.value = null
  babyModel.value = { name: '', gender: 'UNKNOWN', birthWeightGrams: undefined, apgarScore: '', remark: '', riskTagIds: [] }
  babyVisible.value = true
}

function openEditBaby(baby: BabyProfile) {
  editingBaby.value = baby
  babyModel.value = {
    name: baby.name ?? '',
    gender: baby.gender,
    birthDate: baby.birthDate ?? undefined,
    birthWeightGrams: baby.birthWeightGrams ?? undefined,
    apgarScore: baby.apgarScore ?? '',
    remark: baby.remark ?? '',
  }
  babyVisible.value = true
}

async function handleBabySubmit() {
  babySubmitting.value = true
  try {
    if (editingBaby.value) {
      await babyProfileApi.update(editingBaby.value.id, {
        name: babyModel.value.name || undefined,
        gender: babyModel.value.gender,
        birthDate: babyModel.value.birthDate,
        birthWeightGrams: babyModel.value.birthWeightGrams,
        apgarScore: babyModel.value.apgarScore || undefined,
        remark: babyModel.value.remark || undefined,
        version: editingBaby.value.version,
      })
      message.success('宝宝档案已更新')
    } else {
      await babyProfileApi.create({ motherProfileId, ...babyModel.value })
      message.success('宝宝档案已新增')
    }
    babyVisible.value = false
    await fetchAll()
  } finally {
    babySubmitting.value = false
  }
}

const babyColumns: DataTableColumns<BabyProfile> = [
  { key: 'sequenceNo', title: '序号', width: 60 },
  { key: 'name', title: '姓名', render: (row) => row.name ?? '-' },
  { key: 'gender', title: '性别', render: (row) => BABY_GENDER_LABEL_MAP[row.gender] },
  { key: 'birthWeightGrams', title: '出生体重(g)', render: (row) => row.birthWeightGrams ?? '-' },
  { key: 'apgarScore', title: 'Apgar评分', render: (row) => row.apgarScore ?? '-' },
  {
    key: 'riskTags',
    title: '风险标签',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        { default: () => (babyRiskTags.value[row.id] ?? []).map((b) => h(NTag, { size: 'small', key: b.id, color: { color: b.tag.color ?? undefined } }, { default: () => b.tag.name })) },
      ),
  },
  {
    key: 'actions',
    title: '操作',
    width: 90,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditBaby(row) }, { default: () => '编辑' }),
  },
]

// ---------------- 护理计划：生成 ----------------
const planFormVisible = ref(false)
const planSubmitting = ref(false)
const planTargetKey = ref<string | null>(null)
const planTemplateId = ref<string | null>(null)
const planStartDate = ref<number | null>(Date.now())

const compatiblePlanTemplates = computed(() => {
  const target = parseTargetKey(planTargetKey.value)
  if (!target) return []
  return allPlanTemplates.value.filter((t) => t.targetType === target.type).map((t) => ({ label: `${t.name}（${t.totalDays}天）`, value: t.id }))
})

function openCreatePlan() {
  planTargetKey.value = targetOptions.value[0]?.value ?? null
  planTemplateId.value = null
  planStartDate.value = Date.now()
  planFormVisible.value = true
}

async function handleCreatePlan() {
  const target = parseTargetKey(planTargetKey.value)
  if (!target || !planTemplateId.value || !planStartDate.value) {
    message.error('请选择对象、护理方案与开始日期')
    return
  }
  planSubmitting.value = true
  try {
    await carePlanApi.create({
      planTemplateId: planTemplateId.value,
      motherProfileId: target.type === 'MOTHER' ? target.id : undefined,
      babyProfileId: target.type === 'BABY' ? target.id : undefined,
      startDate: new Date(planStartDate.value).toISOString().slice(0, 10),
    })
    message.success('护理计划已生成')
    planFormVisible.value = false
    await fetchAll()
  } finally {
    planSubmitting.value = false
  }
}

// ---------------- 护理计划：查看任务 / 终止 ----------------
const taskDrawerVisible = ref(false)
const activePlan = ref<CarePlan | null>(null)

function openPlanTasks(plan: CarePlan) {
  activePlan.value = plan
  taskDrawerVisible.value = true
}

async function handleTerminatePlan() {
  if (!activePlan.value) return
  const reason = window.prompt('请输入终止原因')
  if (!reason) return
  await carePlanApi.terminate(activePlan.value.id, reason, activePlan.value.version)
  message.success('护理计划已终止')
  taskDrawerVisible.value = false
  await fetchAll()
}

const taskColumns: DataTableColumns<CarePlanTask> = [
  { key: 'dayOffset', title: '第几天', render: (row) => `第${row.dayOffset}天` },
  { key: 'scheduledDate', title: '计划日期', render: (row) => new Date(row.scheduledDate).toLocaleDateString() },
  { key: 'formTemplate', title: '护理项目', render: (row) => row.formTemplate.name },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CARE_PLAN_TASK_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 140,
    render: (row) => {
      if (row.status === 'PENDING') {
        return h(NButton, { size: 'small', type: 'primary', onClick: () => openRecordForTask(row) }, { default: () => '提交记录' })
      }
      if (row.status === 'COMPLETED' && row.careRecordId) {
        return h(NButton, { size: 'small', onClick: () => openRecordDetail(row.careRecordId!) }, { default: () => '查看/更正' })
      }
      return null
    },
  },
]

// ---------------- 护理记录：提交/更正 ----------------
const recordVisible = ref(false)
const recordSubmitting = ref(false)
const recordMode = ref<'submit' | 'correct'>('submit')
const recordTargetKey = ref<string | null>(null)
const recordFormTemplateId = ref<string | null>(null)
const recordCarePlanTaskId = ref<string | undefined>(undefined)
const recordCorrectionOfId = ref<string | undefined>(undefined)
const recordOccurredAt = ref<number | null>(Date.now())
const recordIsBackfilled = ref(false)
const recordBackfillReason = ref('')
const recordValues = ref<Record<string, unknown>>({})

const compatibleFormTemplates = computed(() => {
  const target = parseTargetKey(recordTargetKey.value)
  if (!target) return []
  return allFormTemplates.value.filter((t) => t.targetType === target.type).map((t) => ({ label: t.name, value: t.id }))
})

const activeFormTemplate = computed(() => allFormTemplates.value.find((t) => t.id === recordFormTemplateId.value) ?? null)

function targetKeyOfPlan(plan: CarePlan): string {
  return plan.motherProfileId ? `MOTHER:${plan.motherProfileId}` : `BABY:${plan.babyProfileId}`
}

function openRecordForTask(task: CarePlanTask) {
  if (!activePlan.value) return
  recordMode.value = 'submit'
  recordTargetKey.value = targetKeyOfPlan(activePlan.value)
  recordFormTemplateId.value = task.formTemplateId
  recordCarePlanTaskId.value = task.id
  recordCorrectionOfId.value = undefined
  recordOccurredAt.value = Date.now()
  recordIsBackfilled.value = new Date(task.scheduledDate).toDateString() !== new Date().toDateString()
  recordBackfillReason.value = ''
  recordValues.value = {}
  recordVisible.value = true
}

function openAdhocRecord() {
  recordMode.value = 'submit'
  recordTargetKey.value = targetOptions.value[0]?.value ?? null
  recordFormTemplateId.value = null
  recordCarePlanTaskId.value = undefined
  recordCorrectionOfId.value = undefined
  recordOccurredAt.value = Date.now()
  recordIsBackfilled.value = false
  recordBackfillReason.value = ''
  recordValues.value = {}
  recordVisible.value = true
}

const recordDetailVisible = ref(false)
const recordDetail = ref<CareRecord | null>(null)

async function openRecordDetail(recordId: string) {
  recordDetail.value = await careRecordApi.get(recordId)
  recordDetailVisible.value = true
}

function openCorrect() {
  const record = recordDetail.value
  if (!record) return
  recordMode.value = 'correct'
  recordTargetKey.value = record.motherProfileId ? `MOTHER:${record.motherProfileId}` : `BABY:${record.babyProfileId}`
  recordFormTemplateId.value = record.formTemplateId
  recordCarePlanTaskId.value = undefined
  recordCorrectionOfId.value = record.id
  recordOccurredAt.value = new Date(record.occurredAt).getTime()
  recordIsBackfilled.value = false
  recordBackfillReason.value = ''
  recordValues.value = { ...record.values }
  recordDetailVisible.value = false
  recordVisible.value = true
}

async function handleRecordSubmit() {
  const target = parseTargetKey(recordTargetKey.value)
  if (!target || !recordFormTemplateId.value || !recordOccurredAt.value) {
    message.error('请选择对象、护理项目与发生时间')
    return
  }
  if (recordIsBackfilled.value && !recordBackfillReason.value.trim()) {
    message.error('补录记录必须填写补录原因')
    return
  }
  recordSubmitting.value = true
  try {
    const result = await careRecordApi.create({
      formTemplateId: recordFormTemplateId.value,
      motherProfileId: target.type === 'MOTHER' ? target.id : undefined,
      babyProfileId: target.type === 'BABY' ? target.id : undefined,
      occurredAt: new Date(recordOccurredAt.value).toISOString(),
      values: recordValues.value,
      carePlanTaskId: recordCarePlanTaskId.value,
      isBackfilled: recordIsBackfilled.value,
      backfillReason: recordIsBackfilled.value ? recordBackfillReason.value : undefined,
      correctionOfId: recordCorrectionOfId.value,
    })
    if (result.abnormalities.length > 0) {
      message.warning(`已提交，触发 ${result.abnormalities.length} 条护理异常，请及时跟进`)
    } else {
      message.success('护理记录已提交')
    }
    recordVisible.value = false
    taskDrawerVisible.value = false
    await fetchAll()
  } finally {
    recordSubmitting.value = false
  }
}

// ---------------- 护理异常：跟进/解决/忽略 ----------------
const abnormalityDrawerVisible = ref(false)
const activeAbnormality = ref<CareAbnormality | null>(null)

function openAbnormality(row: CareAbnormality) {
  activeAbnormality.value = row
  abnormalityDrawerVisible.value = true
}

async function handleResolve(ignore: boolean) {
  if (!activeAbnormality.value) return
  const note = window.prompt(ignore ? '忽略原因（可选）' : '处理说明（可选）') ?? undefined
  if (ignore) {
    await careAbnormalityApi.ignore(activeAbnormality.value.id, note, activeAbnormality.value.version)
    message.success('已标记为忽略')
  } else {
    await careAbnormalityApi.resolve(activeAbnormality.value.id, note, activeAbnormality.value.version)
    message.success('护理异常已解决')
  }
  abnormalityDrawerVisible.value = false
  await fetchAll()
}

const planColumns: DataTableColumns<CarePlan> = [
  { key: 'target', title: '对象', render: (row) => targetLabel(row) },
  { key: 'planNo', title: '计划编号' },
  { key: 'startDate', title: '开始日期', render: (row) => new Date(row.startDate).toLocaleDateString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CARE_PLAN_STATUS_MAP) },
  { key: 'progress', title: '任务进度', render: (row) => `${row.tasks.filter((t) => t.status === 'COMPLETED').length}/${row.tasks.length}` },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openPlanTasks(row) }, { default: () => '查看任务' }),
  },
]

const abnormalityColumns: DataTableColumns<CareAbnormality> = [
  { key: 'target', title: '对象', render: (row) => targetLabel(row) },
  { key: 'field', title: '异常字段', render: (row) => row.field.name },
  { key: 'fieldValue', title: '异常值', render: (row) => `${row.fieldValue}${row.field.unit ?? ''}` },
  { key: 'occurredAt', title: '发生时间', render: (row) => new Date(row.occurredAt).toLocaleString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CARE_ABNORMALITY_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openAbnormality(row) }, { default: () => '查看/处理' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div v-if="mother">
    <n-card :title="'母婴档案'" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" @click="openEdit">编辑</n-button>
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="分娩方式">{{ DELIVERY_METHOD_LABEL_MAP[mother.deliveryMethod] }}</n-descriptions-item>
        <n-descriptions-item label="孕周">{{ mother.gestationalWeeks ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="分娩日期">{{ mother.deliveryDate ? new Date(mother.deliveryDate).toLocaleDateString() : '-' }}</n-descriptions-item>
        <n-descriptions-item label="预产期">{{ mother.expectedDeliveryDate ? new Date(mother.expectedDeliveryDate).toLocaleDateString() : '-' }}</n-descriptions-item>
        <n-descriptions-item label="风险标签" :span="2">
          <n-space size="small">
            <n-tag v-for="b in motherRiskTags" :key="b.id" size="small" :color="{ color: b.tag.color ?? undefined }">{{ b.tag.name }}</n-tag>
            <span v-if="motherRiskTags.length === 0">-</span>
          </n-space>
        </n-descriptions-item>
        <n-descriptions-item label="备注" :span="2">{{ mother.remark ?? '-' }}</n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="宝宝档案" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" type="primary" @click="openAddBaby">新增宝宝</n-button>
      </template>
      <n-data-table :columns="babyColumns" :data="mother.babies" :row-key="(r: BabyProfile) => r.id" />
    </n-card>

    <n-card title="护理计划" style="margin-bottom: 16px">
      <template #header-extra>
        <n-space>
          <n-button size="small" @click="openAdhocRecord">补录护理记录</n-button>
          <n-button size="small" type="primary" @click="openCreatePlan">生成护理计划</n-button>
        </n-space>
      </template>
      <n-empty v-if="plans.length === 0" description="暂无护理计划" />
      <n-data-table v-else :columns="planColumns" :data="plans" :row-key="(r: CarePlan) => r.id" />
    </n-card>

    <n-card title="护理异常">
      <n-empty v-if="abnormalities.length === 0" description="暂无护理异常" />
      <n-data-table v-else :columns="abnormalityColumns" :data="abnormalities" :row-key="(r: CareAbnormality) => r.id" />
    </n-card>

    <!-- 编辑妈妈档案 -->
    <n-modal :show="editVisible" @update:show="(v) => (editVisible = v)">
      <n-card title="编辑妈妈档案" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="分娩方式">
            <n-select
              v-model:value="editModel.deliveryMethod"
              :options="[
                { label: '顺产', value: 'VAGINAL' },
                { label: '剖宫产', value: 'CESAREAN' },
                { label: '未知', value: 'UNKNOWN' },
              ]"
            />
          </n-form-item>
          <n-form-item label="分娩日期"><n-date-picker v-model:value="editModel.deliveryDate" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="孕周"><n-input-number v-model:value="editModel.gestationalWeeks" :min="1" :max="45" style="width: 100%" /></n-form-item>
          <n-form-item label="预产期"><n-date-picker v-model:value="editModel.expectedDeliveryDate" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="editModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="editVisible = false">取消</n-button>
            <n-button type="primary" :loading="editSubmitting" @click="handleEditSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 新增/编辑宝宝 -->
    <n-modal :show="babyVisible" @update:show="(v) => (babyVisible = v)">
      <n-card :title="editingBaby ? '编辑宝宝档案' : '新增宝宝档案'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="姓名/编号"><n-input v-model:value="babyModel.name" /></n-form-item>
          <n-form-item label="性别">
            <n-select
              v-model:value="babyModel.gender"
              :options="[
                { label: '男', value: 'MALE' },
                { label: '女', value: 'FEMALE' },
                { label: '未知', value: 'UNKNOWN' },
              ]"
            />
          </n-form-item>
          <n-form-item label="出生体重(g)"><n-input-number v-model:value="babyModel.birthWeightGrams" style="width: 100%" /></n-form-item>
          <n-form-item label="Apgar评分"><n-input v-model:value="babyModel.apgarScore" placeholder="如 9-10" /></n-form-item>
          <n-form-item v-if="!editingBaby" label="风险标签">
            <n-select v-model:value="babyModel.riskTagIds" multiple :options="tagOptions" placeholder="早产/住院/托管等" />
          </n-form-item>
          <n-form-item label="备注"><n-input v-model:value="babyModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="babyVisible = false">取消</n-button>
            <n-button type="primary" :loading="babySubmitting" @click="handleBabySubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 生成护理计划 -->
    <n-modal :show="planFormVisible" @update:show="(v) => (planFormVisible = v)">
      <n-card title="生成护理计划" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="对象">
            <n-select v-model:value="planTargetKey" :options="targetOptions" @update:value="planTemplateId = null" />
          </n-form-item>
          <n-form-item label="护理方案">
            <n-select v-model:value="planTemplateId" :options="compatiblePlanTemplates" placeholder="按对象类型自动过滤" />
          </n-form-item>
          <n-form-item label="开始日期"><n-date-picker v-model:value="planStartDate" type="date" style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="planFormVisible = false">取消</n-button>
            <n-button type="primary" :loading="planSubmitting" @click="handleCreatePlan">生成</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 护理计划任务列表 -->
    <n-modal :show="taskDrawerVisible" @update:show="(v) => (taskDrawerVisible = v)">
      <n-card
        v-if="activePlan"
        :title="`护理任务：${targetLabel(activePlan)} · ${activePlan.planNo}`"
        style="width: 720px"
        :bordered="false"
        role="dialog"
        aria-modal="true"
      >
        <template #header-extra>
          <n-button v-if="activePlan.status === 'ACTIVE'" size="small" type="error" @click="handleTerminatePlan">终止计划</n-button>
        </template>
        <n-data-table :columns="taskColumns" :data="activePlan.tasks" :row-key="(r: CarePlanTask) => r.id" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="taskDrawerVisible = false">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 提交/更正护理记录 -->
    <n-modal :show="recordVisible" @update:show="(v) => (recordVisible = v)">
      <n-card :title="recordMode === 'correct' ? '更正护理记录' : '提交护理记录'" style="width: 600px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="对象">
            <n-select v-model:value="recordTargetKey" :options="targetOptions" :disabled="!!recordCarePlanTaskId || recordMode === 'correct'" @update:value="recordFormTemplateId = null" />
          </n-form-item>
          <n-form-item label="护理项目">
            <n-select
              v-model:value="recordFormTemplateId"
              :options="compatibleFormTemplates"
              :disabled="!!recordCarePlanTaskId || recordMode === 'correct'"
              placeholder="按对象类型自动过滤"
            />
          </n-form-item>
          <n-form-item label="发生时间"><n-date-picker v-model:value="recordOccurredAt" type="datetime" style="width: 100%" /></n-form-item>

          <template v-if="activeFormTemplate">
            <n-divider style="margin: 8px 0">表单内容</n-divider>
            <n-form-item v-for="f in activeFormTemplate.fields.slice().sort((a, b) => a.sortOrder - b.sortOrder)" :key="f.id" :label="`${f.field.name}${f.required ? ' *' : ''}`">
              <n-input-number
                v-if="f.field.controlType === 'NUMBER'"
                v-model:value="recordValues[f.field.code] as number"
                style="width: 100%"
                :placeholder="f.field.unit ?? ''"
              />
              <n-input v-else-if="f.field.controlType === 'TEXT'" v-model:value="recordValues[f.field.code] as string" />
              <n-input v-else-if="f.field.controlType === 'TEXTAREA'" v-model:value="recordValues[f.field.code] as string" type="textarea" />
              <n-select
                v-else-if="f.field.controlType === 'SELECT'"
                v-model:value="recordValues[f.field.code] as string"
                :options="(f.field.options ?? []).map((o) => ({ label: o.label, value: o.value }))"
              />
              <n-radio-group v-else-if="f.field.controlType === 'RADIO'" v-model:value="recordValues[f.field.code] as string">
                <n-radio v-for="o in f.field.options ?? []" :key="o.value" :value="o.value">{{ o.label }}</n-radio>
              </n-radio-group>
            </n-form-item>
          </template>

          <n-form-item v-if="recordMode === 'submit'" label="补录">
            <n-switch v-model:value="recordIsBackfilled" />
          </n-form-item>
          <n-form-item v-if="recordMode === 'submit' && recordIsBackfilled" label="补录原因">
            <n-input v-model:value="recordBackfillReason" placeholder="必填，如：当晚护理师漏记，次日补录" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="recordVisible = false">取消</n-button>
            <n-button type="primary" :loading="recordSubmitting" @click="handleRecordSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 护理记录详情 -->
    <n-modal :show="recordDetailVisible" @update:show="(v) => (recordDetailVisible = v)">
      <n-card v-if="recordDetail" title="护理记录详情" style="width: 560px" :bordered="false" role="dialog" aria-modal="true">
        <n-descriptions :column="1" label-placement="left">
          <n-descriptions-item label="护理项目">{{ recordDetail.formTemplate.name }}</n-descriptions-item>
          <n-descriptions-item label="发生时间">{{ new Date(recordDetail.occurredAt).toLocaleString() }}</n-descriptions-item>
          <n-descriptions-item v-for="f in recordDetail.formTemplate.fields" :key="f.id" :label="f.field.name">
            {{ recordDetail.values[f.field.code] ?? '-' }}{{ f.field.unit ?? '' }}
          </n-descriptions-item>
          <n-descriptions-item v-if="recordDetail.isBackfilled" label="补录原因">{{ recordDetail.backfillReason }}</n-descriptions-item>
          <n-descriptions-item v-if="recordDetail.corrections.length > 0" label="更正记录">已被 {{ recordDetail.corrections.length }} 条记录更正</n-descriptions-item>
        </n-descriptions>
        <template #footer>
          <n-space justify="end">
            <n-button @click="recordDetailVisible = false">关闭</n-button>
            <n-button type="warning" @click="openCorrect">更正此记录</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 护理异常处理 -->
    <n-modal :show="abnormalityDrawerVisible" @update:show="(v) => (abnormalityDrawerVisible = v)">
      <n-card v-if="activeAbnormality" title="护理异常处理" style="width: 560px" :bordered="false" role="dialog" aria-modal="true">
        <n-descriptions :column="1" label-placement="left" style="margin-bottom: 12px">
          <n-descriptions-item label="对象">{{ targetLabel(activeAbnormality) }}</n-descriptions-item>
          <n-descriptions-item label="异常字段">{{ activeAbnormality.field.name }}</n-descriptions-item>
          <n-descriptions-item label="异常值">{{ activeAbnormality.fieldValue }}{{ activeAbnormality.field.unit ?? '' }}</n-descriptions-item>
          <n-descriptions-item label="状态">{{ CARE_ABNORMALITY_STATUS_MAP[activeAbnormality.status]?.label }}</n-descriptions-item>
          <n-descriptions-item v-if="activeAbnormality.resolveNote" label="处理说明">{{ activeAbnormality.resolveNote }}</n-descriptions-item>
        </n-descriptions>
        <CareAbnormalityFollowUps v-if="['OPEN', 'FOLLOWING'].includes(activeAbnormality.status)" :abnormality-id="activeAbnormality.id" @followed="fetchAll" />
        <AiCareAbnormalitySuggestion :abnormality-id="activeAbnormality.id" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="abnormalityDrawerVisible = false">关闭</n-button>
            <template v-if="['OPEN', 'FOLLOWING'].includes(activeAbnormality.status)">
              <n-button @click="handleResolve(true)">忽略</n-button>
              <n-button type="primary" @click="handleResolve(false)">标记已解决</n-button>
            </template>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
