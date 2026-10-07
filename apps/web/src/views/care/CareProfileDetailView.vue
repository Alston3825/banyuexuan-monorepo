<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  NAlert,
  NDivider,
  NTabPane,
  NTabs,
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
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
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
import { dialog, message } from '../../utils/discrete-api'
import CareAbnormalityFollowUps from '../../components/care/CareAbnormalityFollowUps.vue'
import CareOutreachPanel from '../../components/care/CareOutreachPanel.vue'
import CareAssessmentsPanel from '../../components/care/CareAssessmentsPanel.vue'
import CareArchivePanel from '../../components/care/CareArchivePanel.vue'
import NurseSelect from '../../components/care/NurseSelect.vue'
import CarePlanPanel from '../../components/care/CarePlanPanel.vue'
import ServiceLogsPanel from '../../components/care/ServiceLogsPanel.vue'
import CareSummaryPanel from '../../components/care/CareSummaryPanel.vue'
import MedicationPanel from '../../components/care/MedicationPanel.vue'
import DailyRecordsPanel from '../../components/care/DailyRecordsPanel.vue'
import AiCareAbnormalitySuggestion from '../../components/ai/AiCareAbnormalitySuggestion.vue'

const route = useRoute()
const motherProfileId = route.params.id as string
const router = useRouter()

// ---------------- 档案标签页（把护理档案的各部分归到母婴档案下） ----------------
const TAB_NAMES = ['overview', 'admission', 'plans', 'services', 'daily', 'medication', 'discharge', 'summary', 'risk', 'orientation', 'choking', 'outreach']
const activeTab = ref<string>(TAB_NAMES.includes(String(route.query.tab)) ? String(route.query.tab) : 'overview')
watch(activeTab, (name) => {
  if (route.query.tab !== name) router.replace({ query: { ...route.query, tab: name } })
})
// 子页面不再做成横向滑动：电脑上是左侧竖排菜单；手机上是“当前页 ▾”点开后上下排列的列表
const TAB_LABELS: { name: string; label: string }[] = [
  { name: 'overview', label: '概览' },
  { name: 'admission', label: '入所评估' },
  { name: 'plans', label: '护理计划' },
  { name: 'services', label: '服务执行' },
  { name: 'daily', label: '日常护理记录' },
  { name: 'medication', label: '用药委托书' },
  { name: 'discharge', label: '出所评估' },
  { name: 'summary', label: '出所小结' },
  { name: 'risk', label: '风险告知书' },
  { name: 'orientation', label: '入所宣教' },
  { name: 'choking', label: '呛奶应急预案' },
  { name: 'outreach', label: '离店后关怀' },
]
const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))
const menuOpen = ref(false)
const activeLabel = computed(() => TAB_LABELS.find((t) => t.name === activeTab.value)?.label ?? '')
function pickTab(name: string) {
  activeTab.value = name
  menuOpen.value = false
}
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
  occupancyId: null as string | null,
  deliveryMethod: 'UNKNOWN' as MotherProfile['deliveryMethod'],
  deliveryDate: null as number | null,
  gestationalWeeks: null as number | null,
  expectedDeliveryDate: null as number | null,
  careNote: '',
  primaryNurseId: null as string | null,
  remark: '',
})

// 关联入住：列出这位客户还没结束的入住/预订（含当前已关联的），选中后母婴档案就对上房号
const occOptions = ref<{ label: string; value: string }[]>([])
async function loadOccOptions(customerId: string, currentId: string | null) {
  const list = await roomOccupancyApi.list({ customerId, status: undefined })
  occOptions.value = list
    .filter((o) => o.status === 'RESERVED' || o.status === 'CHECKED_IN' || o.id === currentId)
    .map((o) => ({ label: `${o.occupancyNo}（${o.status === 'CHECKED_IN' ? '已入住' : o.status === 'RESERVED' ? '预订中' : o.status === 'CHECKED_OUT' ? '已离店' : '已取消'} ${o.plannedCheckIn.slice(5, 10)}~${o.plannedCheckOut.slice(5, 10)}）`, value: o.id }))
}

function openEdit() {
  if (!mother.value) return
  void loadOccOptions(mother.value.customerId, mother.value.occupancyId)
  editModel.value = {
    occupancyId: mother.value.occupancyId,
    deliveryMethod: mother.value.deliveryMethod,
    deliveryDate: mother.value.deliveryDate ? new Date(mother.value.deliveryDate).getTime() : null,
    gestationalWeeks: mother.value.gestationalWeeks,
    expectedDeliveryDate: mother.value.expectedDeliveryDate ? new Date(mother.value.expectedDeliveryDate).getTime() : null,
    careNote: mother.value.careNote ?? '',
    primaryNurseId: mother.value.primaryNurseId,
    remark: mother.value.remark ?? '',
  }
  editVisible.value = true
}

async function handleEditSubmit() {
  if (!mother.value) return
  editSubmitting.value = true
  try {
    await motherProfileApi.update(mother.value.id, {
      occupancyId: editModel.value.occupancyId ?? undefined,
      deliveryMethod: editModel.value.deliveryMethod,
      deliveryDate: editModel.value.deliveryDate ? new Date(editModel.value.deliveryDate).toISOString() : undefined,
      gestationalWeeks: editModel.value.gestationalWeeks ?? undefined,
      expectedDeliveryDate: editModel.value.expectedDeliveryDate ? new Date(editModel.value.expectedDeliveryDate).toISOString() : undefined,
      careNote: editModel.value.careNote || undefined,
      primaryNurseId: editModel.value.primaryNurseId, // null = 清除
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
    width: 140,
    render: (row) =>
      h(NSpace, { size: 6 }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditBaby(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => removeBaby(row) }, { default: () => '删除' }),
        ],
      }),
  },
]

/**
 * 删除建错/多建的宝宝档案：
 * - 什么数据都没有 → 确认后直接删；
 * - 名下只有评估表/纸质资料（多半是录到了错误的宝宝名下）→ 管理员输入宝宝名字确认后，连同这些数据一起删；普通账号提示联系管理员；
 * - 已有护理记录/计划/异常 → 任何人都不能删。
 */
const babyDel = ref<{ baby: BabyProfile; name: string; attached: string[]; confirm: string } | null>(null)
const babyDelSubmitting = ref(false)

async function removeBaby(baby: BabyProfile) {
  const check = await babyProfileApi.deleteCheck(baby.id)
  if (check.blockers.length > 0) {
    dialog.error({ title: '不能删除这个宝宝', content: `“${check.babyName}”已有${check.blockers.join('、')}，属于护理痕迹，不能删除。`, positiveText: '知道了' })
    return
  }
  if (check.attached.length > 0) {
    if (!check.canForceDelete) {
      dialog.warning({
        title: '需要管理员处理',
        content: `“${check.babyName}”名下已有${check.attached.join('、')}。如果确实是录错了宝宝，需要管理员连同这些数据一起删除，请联系管理员。`,
        positiveText: '知道了',
      })
      return
    }
    babyDel.value = { baby, name: check.babyName, attached: check.attached, confirm: '' }
    return
  }
  dialog.warning({
    title: `删除宝宝档案“${check.babyName}”？`,
    content: '这个宝宝还没有任何护理数据；删除后不能恢复，剩下的宝宝序号会自动重排。',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await babyProfileApi.remove(baby.id)
      message.success('宝宝档案已删除')
      await fetchAll()
    },
  })
}

async function confirmForceRemoveBaby() {
  const d = babyDel.value
  if (!d) return
  if (d.confirm.trim() !== d.name) {
    message.error(`请输入宝宝名字“${d.name}”确认`)
    return
  }
  babyDelSubmitting.value = true
  try {
    await babyProfileApi.remove(d.baby.id, { force: true, confirmName: d.confirm.trim() })
    message.success('已删除宝宝档案及名下的评估表、纸质资料')
    babyDel.value = null
    await fetchAll()
  } finally {
    babyDelSubmitting.value = false
  }
}

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
    <!-- 手机：当前子页面 + 点开后上下排列的完整列表 -->
    <div v-if="isMobile" class="cp-mmenu">
      <div class="cp-mcur" @click="menuOpen = !menuOpen">
        <span>{{ activeLabel }}</span>
        <span class="cp-hint">{{ menuOpen ? '收起 ▴' : '切换子页面 ▾' }}</span>
      </div>
      <div v-if="menuOpen" class="cp-mlist">
        <div v-for="t in TAB_LABELS" :key="t.name" class="cp-mitem" :class="{ 'cp-mon': t.name === activeTab }" @click="pickTab(t.name)">{{ t.label }}</div>
      </div>
    </div>
    <n-tabs v-model:value="activeTab" :placement="isMobile ? 'top' : 'left'" :class="{ 'cp-nonav': isMobile }" type="line" animated display-directive="show:lazy">
      <n-tab-pane name="overview" tab="概览">
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
        <n-descriptions-item label="主责护理师" :span="2">
          <b v-if="mother.primaryNurse">{{ mother.primaryNurse.realName }}</b>
          <a v-else style="color: #d9822b; cursor: pointer; text-decoration: underline" @click="openEdit">未指派，去指派</a>
        </n-descriptions-item>
        <n-descriptions-item label="医嘱" :span="2">{{ mother.careNote ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="备注" :span="2">{{ mother.remark ?? '-' }}</n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="宝宝档案" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" type="primary" @click="openAddBaby">新增宝宝</n-button>
      </template>
      <!-- 手机上用一宝宝一张卡片（表格列太窄会被挤成竖排） -->
      <template v-if="isMobile">
        <div v-if="mother.babies.length === 0" class="cp-baby-empty">还没有宝宝档案，点右上角“新增宝宝”</div>
        <div v-for="b in mother.babies" :key="b.id" class="cp-baby">
          <div class="cp-baby-top">
            <b>{{ b.sequenceNo }} 号宝宝 · {{ b.name ?? '未取名' }}</b>
            <span class="cp-baby-sub">{{ BABY_GENDER_LABEL_MAP[b.gender] }}</span>
          </div>
          <div class="cp-baby-line">出生体重 {{ b.birthWeightGrams ?? '-' }} g · Apgar 评分 {{ b.apgarScore ?? '-' }}</div>
          <n-space v-if="(babyRiskTags[b.id] ?? []).length" :size="4" style="margin-top: 6px">
            <n-tag v-for="t in babyRiskTags[b.id]" :key="t.id" size="small" :color="{ color: t.tag.color ?? undefined }">{{ t.tag.name }}</n-tag>
          </n-space>
          <n-space style="margin-top: 8px" :size="8">
            <n-button size="small" @click="openEditBaby(b)">编辑</n-button>
            <n-button size="small" type="error" ghost @click="removeBaby(b)">删除</n-button>
          </n-space>
        </div>
      </template>
      <n-data-table v-else :columns="babyColumns" :data="mother.babies" :row-key="(r: BabyProfile) => r.id" />
    </n-card>

      </n-tab-pane>

      <n-tab-pane name="admission" tab="入所评估">
        <CareAssessmentsPanel ref="admissionPanel" :mother-profile-id="motherProfileId" stage="admission" />
      </n-tab-pane>

      <n-tab-pane name="plans" tab="护理计划">
        <CarePlanPanel :mother-profile-id="motherProfileId" :babies="mother.babies" style="margin-bottom: 18px" />
        <n-alert type="info" :bordered="false" style="margin-bottom: 14px">
          上面是个人化护理计划（三级护理、护理长制定、护理主任审核、每 7 天评审）。下面是旧的“按模板生成护理任务”和护理异常，保留不变。
        </n-alert>
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

    <n-card title="护理异常" style="margin-bottom: 16px">
      <n-empty v-if="abnormalities.length === 0" description="暂无护理异常" />
      <n-data-table v-else :columns="abnormalityColumns" :data="abnormalities" :row-key="(r: CareAbnormality) => r.id" />
    </n-card>

      </n-tab-pane>

      <n-tab-pane name="services" tab="服务执行">
        <ServiceLogsPanel :mother-profile-id="motherProfileId" />
      </n-tab-pane>

      <n-tab-pane name="daily" tab="日常护理记录">
        <DailyRecordsPanel :mother-profile-id="motherProfileId" />
      </n-tab-pane>

      <n-tab-pane name="medication" tab="用药委托书">
        <MedicationPanel :mother-profile-id="motherProfileId" :babies="mother.babies" />
      </n-tab-pane>

      <n-tab-pane name="discharge" tab="出所评估">
        <CareAssessmentsPanel ref="dischargePanel" :mother-profile-id="motherProfileId" stage="discharge" />
      </n-tab-pane>

      <n-tab-pane name="summary" tab="出所小结">
        <CareSummaryPanel :mother-profile-id="motherProfileId" />
      </n-tab-pane>

      <!-- 只拍照留档的三种资料，各占一个标签，和上面的评估/记录并列，上传时一目了然 -->
      <n-tab-pane name="risk" tab="风险告知书">
        <CareArchivePanel :mother-profile-id="motherProfileId" doc-type="RISK_NOTICE" hint="《产妇及新生儿风险告知书》：入住时让宝妈或家属签字，签好后拍照上传归档。" />
      </n-tab-pane>

      <n-tab-pane name="orientation" tab="入所宣教">
        <CareArchivePanel :mother-profile-id="motherProfileId" doc-type="ORIENTATION" hint="《会所入住宣教》：向宝妈宣教后，家属和责任护理师签字，签好后拍照上传归档（含签字页）。" />
      </n-tab-pane>

      <n-tab-pane name="choking" tab="呛奶应急预案">
        <CareArchivePanel :mother-profile-id="motherProfileId" doc-type="CHOKING_PROTOCOL" hint="《新生儿呛奶应急预案及处理方法》：教会家属后，如有签字页，拍照上传归档。" />
      </n-tab-pane>

      <n-tab-pane name="outreach" tab="离店后关怀">
        <CareOutreachPanel :mother-profile-id="motherProfileId" />
      </n-tab-pane>
    </n-tabs>

    <!-- 管理员：连同评估表/纸质资料一起删除宝宝档案 -->
    <n-modal :show="!!babyDel" @update:show="(v) => !v && (babyDel = null)">
      <n-card v-if="babyDel" title="删除宝宝档案及名下数据" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <p style="margin: 0 0 10px; line-height: 1.7">
          “<b>{{ babyDel.name }}</b>”名下已有：<b style="color: #c0392b">{{ babyDel.attached.join('、') }}</b>。<br />
          继续删除会把这个宝宝档案和上面这些数据（含纸质原件照片）<b>一起永久删除</b>，不能恢复，操作会记入审计日志。
        </p>
        <n-input v-model:value="babyDel.confirm" :placeholder="`请输入宝宝名字“${babyDel.name}”确认`" @keyup.enter="confirmForceRemoveBaby" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="babyDel = null">取消</n-button>
            <n-button type="error" :loading="babyDelSubmitting" :disabled="babyDel.confirm.trim() !== babyDel.name" @click="confirmForceRemoveBaby">永久删除</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 编辑妈妈档案 -->
    <n-modal :show="editVisible" @update:show="(v) => (editVisible = v)">
      <n-card title="编辑妈妈档案" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
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
          <n-form-item label="关联入住">
            <n-select v-model:value="editModel.occupancyId" :options="occOptions" clearable placeholder="选择这位客户的入住/预订记录（决定房号）" />
          </n-form-item>
          <n-form-item label="分娩日期"><n-date-picker v-model:value="editModel.deliveryDate" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="孕周"><n-input-number v-model:value="editModel.gestationalWeeks" :min="1" :max="45" style="width: 100%" /></n-form-item>
          <n-form-item label="预产期"><n-date-picker v-model:value="editModel.expectedDeliveryDate" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="主责护理师"><nurse-select v-model="editModel.primaryNurseId" :store-id="mother?.storeId" /></n-form-item>
          <n-form-item label="医嘱"><n-input v-model:value="editModel.careNote" placeholder="护理看板卡片上显示的简短提示" /></n-form-item>
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
      <n-card :title="editingBaby ? '编辑宝宝档案' : '新增宝宝档案'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
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
      <n-card title="生成护理计划" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
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
        style="width: min(720px, 94vw)"
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
      <n-card :title="recordMode === 'correct' ? '更正护理记录' : '提交护理记录'" style="width: min(600px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
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
      <n-card v-if="recordDetail" title="护理记录详情" style="width: min(560px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
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
      <n-card v-if="activeAbnormality" title="护理异常处理" style="width: min(560px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
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

<style scoped>
.cp-mmenu {
  margin-bottom: 10px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.cp-mcur {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  font-weight: 600;
  color: #1f3a5f;
}
.cp-hint {
  color: #999;
  font-size: 12px;
  font-weight: 400;
}
.cp-mlist {
  border-top: 1px solid #f0f0f0;
}
.cp-mitem {
  padding: 13px 14px;
  border-bottom: 1px solid #f6f6f6;
  font-size: 15px;
}
.cp-mitem:last-child {
  border-bottom: none;
}
.cp-mon {
  background: #eef7f0;
  color: #18a058;
  font-weight: 600;
}
.cp-baby {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
}
.cp-baby-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cp-baby-sub {
  color: #888;
  font-size: 13px;
}
.cp-baby-line {
  margin-top: 4px;
  color: #555;
  font-size: 13px;
}
.cp-baby-empty {
  padding: 12px 0;
  color: #999;
  font-size: 13px;
}
/* 手机上用自己的竖排列表，隐藏 naive 自带的标签栏 */
.cp-nonav :deep(.n-tabs-nav) {
  display: none;
}
:deep(.n-tabs.n-tabs--left .n-tabs-nav) {
  min-width: 120px;
}
</style>
