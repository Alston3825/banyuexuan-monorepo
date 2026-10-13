<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert, NButton, NCard, NDatePicker, NInput, NInputNumber, NModal, NRadio, NRadioGroup, NSelect, NSpace, NSpin, NSwitch, NTag,
} from 'naive-ui'
import ContractField from './ContractField.vue'
import { contractApi } from '../../api/modules/contract.api'
import { accountApi } from '../../api/modules/account.api'
import { roomTypeApi } from '../../api/modules/room-type.api'
import {
  CARE_MODE_LABEL, ORIENTATION_LABEL,
  type ContractDetail, type ContractFile, type CustomerMatch, type ExtractWarning, type UpdateContractDto,
} from '../../api/types/contract'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = route.params.id as string

const detail = ref<ContractDetail | null>(null)
const loading = ref(true)
const saving = ref(false)

// ---------------- 表单（详情的可编辑副本） ----------------
interface FormState {
  paperNo: string
  signedDate: string | null
  signerId: string | null
  clientName: string
  clientPhone: string
  clientIdCardNo: string
  clientHospital: string
  clientAddress: string
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  fetus: string | null
  dueDate: string | null
  roomTypeText: string
  roomTypeId: string | null
  orientation: string | null
  careMode: string | null
  inHouseDays: number | null
  homeServiceDays: number
  daysText: string
  estimatedCheckIn: string | null
  estimatedCheckOut: string | null
  amountYuan: number | null
  depositYuan: number | null
  depositPaid: boolean
  depositMethod: string | null
  depositPaidAt: string | null
  items: { name: string; quantity: string; needsReview: boolean }[]
}
const form = reactive<FormState>({
  paperNo: '', signedDate: null, signerId: null, clientName: '', clientPhone: '', clientIdCardNo: '', clientHospital: '', clientAddress: '',
  emergencyName: '', emergencyRelation: '', emergencyPhone: '', fetus: null, dueDate: null, roomTypeText: '', roomTypeId: null,
  orientation: null, careMode: null, inHouseDays: null, homeServiceDays: 0, daysText: '', estimatedCheckIn: null, estimatedCheckOut: null,
  amountYuan: null, depositYuan: null, depositPaid: false, depositMethod: null, depositPaidAt: null, items: [],
})

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

function fillForm(d: ContractDetail) {
  Object.assign(form, {
    paperNo: d.paperNo ?? '', signedDate: day(d.signedDate), signerId: d.signerId, clientName: d.clientName ?? '', clientPhone: d.clientPhone ?? '',
    clientIdCardNo: d.clientIdCardNo ?? '', clientHospital: d.clientHospital ?? '', clientAddress: d.clientAddress ?? '',
    emergencyName: d.emergencyName ?? '', emergencyRelation: d.emergencyRelation ?? '', emergencyPhone: d.emergencyPhone ?? '',
    fetus: d.fetus, dueDate: day(d.dueDate), roomTypeText: d.roomTypeText ?? '', roomTypeId: d.roomTypeId, orientation: d.orientation,
    careMode: d.careMode, inHouseDays: d.inHouseDays, homeServiceDays: d.homeServiceDays ?? 0, daysText: d.daysText ?? '',
    estimatedCheckIn: day(d.estimatedCheckIn), estimatedCheckOut: day(d.estimatedCheckOut),
    amountYuan: d.amount ? d.amount / 100 : null, depositYuan: d.depositAmount != null ? d.depositAmount / 100 : null,
    depositPaid: d.depositPaid, depositMethod: d.depositMethod, depositPaidAt: day(d.depositPaidAt),
    items: d.items.map((i) => ({ name: i.name, quantity: i.quantity ?? '', needsReview: i.needsReview })),
  })
}

const nn = (s: string) => (s.trim() ? s.trim() : null)

function toPayload(): UpdateContractDto {
  return {
    version: detail.value!.version,
    paperNo: nn(form.paperNo), signedDate: form.signedDate, signerId: form.signerId,
    clientName: nn(form.clientName), clientPhone: nn(form.clientPhone), clientIdCardNo: nn(form.clientIdCardNo),
    clientHospital: nn(form.clientHospital), clientAddress: nn(form.clientAddress),
    emergencyName: nn(form.emergencyName), emergencyRelation: nn(form.emergencyRelation), emergencyPhone: nn(form.emergencyPhone),
    fetus: form.fetus, dueDate: form.dueDate,
    roomTypeText: nn(form.roomTypeText), roomTypeId: form.roomTypeId,
    orientation: form.orientation as UpdateContractDto['orientation'], careMode: form.careMode as UpdateContractDto['careMode'],
    inHouseDays: form.inHouseDays, homeServiceDays: form.homeServiceDays ?? 0, daysText: nn(form.daysText),
    estimatedCheckIn: form.estimatedCheckIn, estimatedCheckOut: form.estimatedCheckOut,
    amount: Math.round((form.amountYuan ?? 0) * 100),
    depositAmount: form.depositYuan != null ? Math.round(form.depositYuan * 100) : null,
    depositPaid: form.depositPaid, depositMethod: form.depositMethod as UpdateContractDto['depositMethod'], depositPaidAt: form.depositPaidAt,
    items: form.items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), quantity: nn(i.quantity), needsReview: i.needsReview })),
  }
}

// ---------------- 加载 / 识别进度轮询 ----------------
let pollTimer: number | undefined
const extracting = computed(() => detail.value?.extractStatus === 'PENDING' || detail.value?.extractStatus === 'RUNNING')

async function load(first = false) {
  const d = await contractApi.get(id)
  const wasExtracting = detail.value ? extracting.value : false
  detail.value = d
  if (first || wasExtracting || !dirty.value) fillForm(d)
  loading.value = false
  window.clearTimeout(pollTimer)
  if (extracting.value) pollTimer = window.setTimeout(() => load(), 3000)
  else if (wasExtracting) message.success('AI 识别完成，请核对标黄/标红的项目')
}

// 是否有还没保存的修改（用来避免后台刷新把用户正在改的内容覆盖掉）
const dirty = ref(false)
watch(form, () => (dirty.value = true), { deep: true })
const touched = reactive(new Set<string>())
function touch(key: string) {
  touched.add(key)
}

onMounted(async () => {
  await load(true)
  dirty.value = false
  touched.clear()
  loadOptions()
  if (detail.value?.status === 'PENDING_REVIEW') loadMatches()
})
onBeforeUnmount(() => {
  window.clearTimeout(pollTimer)
  Object.values(imgUrls).forEach((u) => URL.revokeObjectURL(u))
})

// ---------------- 下拉选项 ----------------
const signerOptions = ref<{ label: string; value: string }[]>([])
const roomTypeOptions = ref<{ label: string; value: string }[]>([])
async function loadOptions() {
  const [accounts, types] = await Promise.all([accountApi.list().catch(() => []), roomTypeApi.list().catch(() => [])])
  signerOptions.value = accounts.map((a) => ({ label: a.realName, value: a.id }))
  roomTypeOptions.value = types.map((t) => ({ label: t.name, value: t.id }))
}
const fetusOptions = [{ label: '单胎', value: 'single' }, { label: '双胎', value: 'twin' }, { label: '多胎', value: 'multi' }]
const orientationOptions = Object.entries(ORIENTATION_LABEL).map(([value, label]) => ({ label, value }))
const careModeOptions = Object.entries(CARE_MODE_LABEL).map(([value, label]) => ({ label, value }))
const methodOptions = [
  { label: '现金', value: 'CASH' }, { label: '银行转账', value: 'BANK_TRANSFER' }, { label: '微信', value: 'WECHAT' },
  { label: '支付宝', value: 'ALIPAY' }, { label: 'POS刷卡', value: 'POS_CARD' }, { label: '其他', value: 'OTHER' },
]

// ---------------- AI 提醒 ----------------
const FIELD_KEYS: Record<string, string[]> = {
  paperNo: ['contract_no'], signedDate: ['signed_date'], clientName: ['mother_name'], clientPhone: ['phone'],
  clientIdCardNo: ['id_card_no'], dueDate: ['due_date'], clientHospital: ['hospital'], clientAddress: ['address'],
  emergencyName: ['emergency_name'], emergencyPhone: ['emergency_phone'], roomTypeText: ['room_type_text'],
  careMode: ['care_mode'], inHouseDays: ['in_house_days', 'days_text'], amount: ['package_amount'],
  depositAmount: ['deposit_amount'], items: ['gift_items'],
}
const reviewing = computed(() => detail.value?.status === 'PENDING_REVIEW')
const warnings = computed<ExtractWarning[]>(() => (reviewing.value ? detail.value?.extractWarnings ?? [] : []))

function noteFor(field: string) {
  if (touched.has(field)) return null
  const hits = warnings.value.filter((w) => w.level !== 'info' && (FIELD_KEYS[field] ?? []).includes(w.field))
  if (hits.length === 0) return null
  const worst = hits.find((w) => w.level === 'missing') ?? hits[0]
  return { level: worst.level as 'missing' | 'warn', message: hits.map((h) => h.message).join('；'), page: worst.page }
}
const pendingCount = computed(() => Object.keys(FIELD_KEYS).filter((f) => noteFor(f)).length)
const generalWarnings = computed(() => warnings.value.filter((w) => w.field === 'pages'))

// ---------------- 原件查看 ----------------
const PAGE_KIND_LABEL: Record<string, string> = {
  cover: '封面', body_1: '正文1', body_2: '正文2', body_sign: '签字页', attachment: '附件', back_cover: '封底', other: '其他',
}
const pages = computed<ContractFile[]>(() => detail.value?.files.filter((f) => f.kind === 'PAGE') ?? [])
const originals = computed<ContractFile[]>(() => detail.value?.files.filter((f) => f.kind === 'ORIGINAL') ?? [])
// 识别完成前还没有逐页图片；如果原件本身就是图片（手机照片），先直接显示原件
const viewFiles = computed<ContractFile[]>(() => (pages.value.length > 0 ? pages.value : originals.value.filter((f) => f.mimeType.startsWith('image/'))))
const current = ref(0)
const zoom = ref(100)
const imgUrls = reactive<Record<string, string>>({})

async function ensureImage(file?: ContractFile) {
  if (!file || imgUrls[file.id]) return
  try {
    imgUrls[file.id] = URL.createObjectURL(await contractApi.fileBlob(id, file.id))
  } catch {
    /* 图片取不到时保持空白，不打断核对 */
  }
}
watch([viewFiles, current], () => {
  ensureImage(viewFiles.value[current.value])
  ensureImage(viewFiles.value[current.value + 1])
}, { immediate: true })

function gotoPage(pageNo: number) {
  const idx = viewFiles.value.findIndex((f) => f.pageNo === pageNo)
  if (idx >= 0) current.value = idx
}
function pageLabel(f: ContractFile, idx: number) {
  return f.pageKind ? `${idx + 1} ${PAGE_KIND_LABEL[f.pageKind] ?? ''}` : `${idx + 1}`
}
async function downloadOriginal(f: ContractFile) {
  const url = URL.createObjectURL(await contractApi.fileBlob(id, f.id))
  const a = document.createElement('a')
  a.href = url
  a.download = f.fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------- 日期联动：预估入住 / 预估离店 ----------------
const CHECK_IN_OFFSET_DAYS = 4 // 销售习惯把入住日期定在预产期后 3-5 天，取中间值
function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
function recalcCheckOut() {
  form.estimatedCheckOut = form.estimatedCheckIn && form.inHouseDays ? addDaysStr(form.estimatedCheckIn, form.inHouseDays) : null
}
function onDueDateEdit() {
  touch('dueDate')
  if (form.dueDate && !form.estimatedCheckIn) {
    form.estimatedCheckIn = addDaysStr(form.dueDate, CHECK_IN_OFFSET_DAYS)
    recalcCheckOut()
  }
}
function onCheckInEdit() {
  recalcCheckOut()
}
function onDaysEdit() {
  touch('inHouseDays')
  recalcCheckOut()
}

// ---------------- 赠送项目 ----------------
function addItem() {
  form.items.push({ name: '', quantity: '', needsReview: false })
}
function removeItem(i: number) {
  form.items.splice(i, 1)
  touch('items')
}

// ---------------- 保存 / 确认 ----------------
async function save(silent = false): Promise<boolean> {
  saving.value = true
  try {
    detail.value = await contractApi.update(id, toPayload())
    dirty.value = false
    if (!silent) message.success('已保存')
    return true
  } catch {
    return false
  } finally {
    saving.value = false
  }
}

function missingRequired(): string[] {
  const m: string[] = []
  if (!form.clientName.trim()) m.push('客户姓名')
  if (!form.clientPhone.trim()) m.push('客户手机号')
  if (!form.paperNo.trim()) m.push('合同编号')
  if (!form.signedDate) m.push('签约日期')
  if (!form.roomTypeId && !form.roomTypeText.trim()) m.push('房型')
  if (!form.careMode) m.push('护理模式')
  if (!form.inHouseDays) m.push('入住天数')
  if (!form.amountYuan || form.amountYuan <= 0) m.push('套餐金额')
  return m
}

const confirmVisible = ref(false)
const confirming = ref(false)
const matches = ref<CustomerMatch[]>([])
const chosenCustomer = ref<string>('NEW')

async function loadMatches() {
  try {
    const m = await contractApi.customerMatches(id)
    matches.value = m.matches
    chosenCustomer.value = m.suggestedId ?? 'NEW'
  } catch {
    matches.value = []
  }
}

async function openConfirm() {
  const missing = missingRequired()
  if (missing.length > 0) {
    message.error(`还有必填项没有填：${missing.join('、')}`)
    return
  }
  if (!(await save(true))) return
  await loadMatches()
  confirmVisible.value = true
}

async function doConfirm() {
  confirming.value = true
  try {
    detail.value = await contractApi.confirm(id, detail.value!.version, chosenCustomer.value === 'NEW' ? undefined : chosenCustomer.value)
    confirmVisible.value = false
    dirty.value = false
    message.success('合同已确认入库，可以到房态图上排房了')
    await load(true)
  } finally {
    confirming.value = false
  }
}

// ---------------- 其他操作 ----------------
function handleReextract() {
  dialog.warning({
    title: '重新识别',
    content: '重新识别会用 AI 的结果覆盖你已经修改的内容，确认继续吗？',
    positiveText: '重新识别',
    negativeText: '取消',
    onPositiveClick: async () => {
      detail.value = await contractApi.reextract(id)
      touched.clear()
      load(true)
    },
  })
}

function handleDelete() {
  dialog.error({
    title: '删除合同',
    content: '删除后原件图片和识别结果都会一起清除，无法恢复。确认删除这份未确认的合同吗？',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await contractApi.remove(id)
      message.success('已删除')
      router.replace('/contract/records')
    },
  })
}

const voidVisible = ref(false)
const voidReason = ref('')
const voiding = ref(false)
async function doVoid() {
  if (!voidReason.value.trim()) {
    message.error('请填写作废原因')
    return
  }
  voiding.value = true
  try {
    detail.value = await contractApi.void(id, voidReason.value.trim(), detail.value!.version)
    voidVisible.value = false
    message.success('合同已作废')
  } finally {
    voiding.value = false
  }
}

const canEdit = computed(() => !!detail.value && ['PENDING_REVIEW', 'ACTIVE'].includes(detail.value.status) && !extracting.value)
const roomAssigned = computed(() => (detail.value?.roomOccupancies.length ?? 0) > 0)
const statusText = computed(() => {
  const d = detail.value
  if (!d) return ''
  if (d.status === 'PENDING_REVIEW') return extracting.value ? 'AI 识别中' : d.extractStatus === 'FAILED' ? '识别失败' : '待核对'
  if (d.status === 'ACTIVE') return roomAssigned.value ? '已排房' : '待排房'
  return d.status === 'VOIDED' ? '已作废' : d.status
})
const statusType = computed(() => {
  const d = detail.value
  if (!d) return 'default'
  if (d.status === 'PENDING_REVIEW') return extracting.value ? 'info' : d.extractStatus === 'FAILED' ? 'error' : 'warning'
  if (d.status === 'ACTIVE') return roomAssigned.value ? 'success' : 'primary'
  return 'default'
})
function goAssignRoom() {
  router.push({ path: '/room/board-horizontal', query: { contract: id } })
}
</script>

<template>
  <n-spin :show="loading">
    <div v-if="detail" class="cv-wrap">
      <!-- 左：合同原件 -->
      <div class="cv-viewer">
        <n-card size="small" :bordered="true" title="合同原件">
          <template #header-extra>
            <n-space size="small">
              <n-button v-for="f in originals" :key="f.id" size="tiny" @click="downloadOriginal(f)">下载 {{ f.fileName.length > 14 ? f.fileName.slice(0, 12) + '…' : f.fileName }}</n-button>
            </n-space>
          </template>
          <div v-if="viewFiles.length === 0" class="cv-empty">
            {{ extracting ? '识别完成后这里会显示逐页图片' : originals.length === 0 ? '这份合同没有上传原件' : '原件是 PDF，识别完成后显示逐页图片' }}
          </div>
          <template v-else>
            <div class="cv-thumbs">
              <n-button v-for="(f, i) in viewFiles" :key="f.id" size="tiny" :type="i === current ? 'primary' : 'default'" :secondary="i !== current" @click="current = i">
                {{ pageLabel(f, i) }}
              </n-button>
            </div>
            <n-space size="small" align="center" style="margin: 8px 0">
              <n-button size="tiny" :disabled="current === 0" @click="current--">上一页</n-button>
              <n-button size="tiny" :disabled="current >= viewFiles.length - 1" @click="current++">下一页</n-button>
              <span class="cv-zoom-label">缩放</span>
              <n-button size="tiny" @click="zoom = Math.max(50, zoom - 25)">－</n-button>
              <span class="cv-zoom-label">{{ zoom }}%</span>
              <n-button size="tiny" @click="zoom = Math.min(300, zoom + 25)">＋</n-button>
            </n-space>
            <div class="cv-imgbox">
              <img v-if="imgUrls[viewFiles[current].id]" :src="imgUrls[viewFiles[current].id]" :style="{ width: zoom + '%' }" alt="合同页面" />
              <div v-else class="cv-empty">图片加载中…</div>
            </div>
          </template>
        </n-card>
      </div>

      <!-- 右：数据 -->
      <div class="cv-form">
        <n-space justify="space-between" align="center" style="margin-bottom: 10px" :wrap="true">
          <n-space align="center">
            <span class="cv-title">合同 {{ detail.paperNo || `（编号待填）${detail.contractNo.slice(-6)}` }}</span>
            <n-tag :type="statusType as any" round size="small">{{ statusText }}</n-tag>
          </n-space>
          <n-button size="small" quaternary @click="router.push('/contract/records')">返回列表</n-button>
        </n-space>

        <n-alert v-if="extracting" type="info" style="margin-bottom: 10px" :show-icon="true">
          AI 正在识别这份合同（约 1 分钟），完成后会自动预填下面的内容，请稍候…
        </n-alert>
        <n-alert v-else-if="detail.extractStatus === 'FAILED'" type="error" style="margin-bottom: 10px">
          AI 识别失败：{{ detail.extractError || '未知原因' }}。你可以点下方“重新识别”重试，或直接手工填写。
        </n-alert>
        <n-alert v-else-if="reviewing && detail.extractStatus === 'DONE'" :type="pendingCount > 0 ? 'warning' : 'success'" style="margin-bottom: 10px">
          AI 已预填。<template v-if="pendingCount > 0">有 <b>{{ pendingCount }}</b> 项需要你对照左侧原图核对（<b style="color:#854f0b">黄色</b>=请核对，<b style="color:#a32d2d">红色</b>=没识别到/必填未填），改完或确认无误后点“确认并入库”。</template>
          <template v-else>没有需要特别核对的项目，请快速过一遍，确认无误后点“确认并入库”。</template>
        </n-alert>
        <n-alert v-else-if="reviewing && detail.extractStatus === 'NONE'" type="info" style="margin-bottom: 10px">手工录入的合同：请对照纸质合同填写，确认无误后点“确认并入库”。</n-alert>
        <n-alert v-else-if="detail.status === 'ACTIVE'" :type="roomAssigned ? 'success' : 'info'" style="margin-bottom: 10px">
          合同已确认入库。<template v-if="!roomAssigned">还没有排房：请到房态图上给这位客户排房。</template><template v-else>已排房。</template>
        </n-alert>
        <n-alert v-else-if="detail.status === 'VOIDED'" type="default" style="margin-bottom: 10px">合同已作废：{{ detail.voidReason }}</n-alert>
        <n-alert v-for="w in generalWarnings" :key="w.message" type="warning" style="margin-bottom: 10px">{{ w.message }}</n-alert>

        <fieldset :disabled="!canEdit" class="cv-fieldset">
          <n-card size="small" title="合同信息" class="cv-card">
            <div class="cv-grid">
              <ContractField label="合同编号（纸质合同封面）" required :note="noteFor('paperNo')" @goto-page="gotoPage"><n-input v-model:value="form.paperNo" placeholder="如 2026-08-363" @update:value="touch('paperNo')" /></ContractField>
              <ContractField label="签约日期" required :note="noteFor('signedDate')" @goto-page="gotoPage">
                <n-date-picker v-model:formatted-value="form.signedDate" value-format="yyyy-MM-dd" type="date" clearable style="width: 100%" @update:formatted-value="touch('signedDate')" />
              </ContractField>
              <ContractField label="签单人" auto="默认上传人"><n-select v-model:value="form.signerId" :options="signerOptions" filterable clearable /></ContractField>
            </div>
          </n-card>

          <n-card size="small" title="客户信息" class="cv-card">
            <div class="cv-grid">
              <ContractField label="姓名" required :note="noteFor('clientName')" @goto-page="gotoPage"><n-input v-model:value="form.clientName" @update:value="touch('clientName')" /></ContractField>
              <ContractField label="手机号" required :note="noteFor('clientPhone')" @goto-page="gotoPage"><n-input v-model:value="form.clientPhone" @update:value="touch('clientPhone')" /></ContractField>
              <ContractField label="身份证号" :note="noteFor('clientIdCardNo')" @goto-page="gotoPage"><n-input v-model:value="form.clientIdCardNo" @update:value="touch('clientIdCardNo')" /></ContractField>
              <ContractField label="预产期" :note="noteFor('dueDate')" @goto-page="gotoPage">
                <n-date-picker v-model:formatted-value="form.dueDate" value-format="yyyy-MM-dd" type="date" clearable style="width: 100%" @update:formatted-value="onDueDateEdit" />
              </ContractField>
              <ContractField label="产检医院" :note="noteFor('clientHospital')" @goto-page="gotoPage"><n-input v-model:value="form.clientHospital" @update:value="touch('clientHospital')" /></ContractField>
              <ContractField label="胎数"><n-select v-model:value="form.fetus" :options="fetusOptions" clearable /></ContractField>
              <ContractField label="家庭地址" :note="noteFor('clientAddress')" @goto-page="gotoPage" style="grid-column: 1 / -1"><n-input v-model:value="form.clientAddress" @update:value="touch('clientAddress')" /></ContractField>
              <ContractField label="紧急联系人" :note="noteFor('emergencyName')" @goto-page="gotoPage"><n-input v-model:value="form.emergencyName" @update:value="touch('emergencyName')" /></ContractField>
              <ContractField label="与产妇关系"><n-input v-model:value="form.emergencyRelation" /></ContractField>
              <ContractField label="紧急联系人电话" :note="noteFor('emergencyPhone')" @goto-page="gotoPage"><n-input v-model:value="form.emergencyPhone" @update:value="touch('emergencyPhone')" /></ContractField>
            </div>
            <div v-if="reviewing" class="cv-match">
              <div class="cv-match-title">
                客户档案匹配
                <n-button size="tiny" quaternary @click="loadMatches">重新匹配</n-button>
              </div>
              <template v-if="matches.length > 0">
                <div class="cv-match-tip">系统里找到了可能是同一位客户的档案，确认入库时会关联到你选的客户，并把合同里有、档案里没有的信息补进去（不会覆盖已有信息）。</div>
                <div v-for="m in matches" :key="m.id" class="cv-match-item">{{ m.name }}　{{ m.phone }}　{{ m.customerNo }}　<n-tag size="tiny" round>{{ m.reason === 'PHONE' ? '手机号相同' : '同名' }}</n-tag></div>
              </template>
              <div v-else class="cv-match-tip">没有找到已有客户，确认入库时会按合同上的姓名手机号新建客户。</div>
            </div>
          </n-card>

          <n-card size="small" title="套餐与入住" class="cv-card">
            <div class="cv-grid">
              <ContractField label="预订房型（合同手写原文）" required :note="noteFor('roomTypeText')" @goto-page="gotoPage"><n-input v-model:value="form.roomTypeText" placeholder="如 至臻" @update:value="touch('roomTypeText')" /></ContractField>
              <ContractField label="对应系统房型" :auto="form.roomTypeId ? '已匹配' : '未匹配'"><n-select v-model:value="form.roomTypeId" :options="roomTypeOptions" clearable filterable /></ContractField>
              <ContractField label="朝向"><n-select v-model:value="form.orientation" :options="orientationOptions" clearable /></ContractField>
              <ContractField label="护理模式" required :note="noteFor('careMode')" @goto-page="gotoPage"><n-select v-model:value="form.careMode" :options="careModeOptions" clearable @update:value="touch('careMode')" /></ContractField>
              <ContractField label="入住天数（N+N 的第一个 N）" required :note="noteFor('inHouseDays')" @goto-page="gotoPage">
                <n-input-number v-model:value="form.inHouseDays" :min="0" style="width: 100%" @update:value="onDaysEdit" />
              </ContractField>
              <ContractField label="到家服务天数（第二个 N）"><n-input-number v-model:value="form.homeServiceDays" :min="0" style="width: 100%" /></ContractField>
              <ContractField label="预估入住日期" auto="预估">
                <n-date-picker v-model:formatted-value="form.estimatedCheckIn" value-format="yyyy-MM-dd" type="date" clearable style="width: 100%" @update:formatted-value="onCheckInEdit" />
              </ContractField>
              <ContractField label="预估离店日期" auto="自动 = 入住 + 天数">
                <n-date-picker v-model:formatted-value="form.estimatedCheckOut" value-format="yyyy-MM-dd" type="date" clearable style="width: 100%" />
              </ContractField>
            </div>
            <div class="cv-hint">合同上没有入住日期，这里是销售按预产期往后推几天预估的（默认预产期 + 4 天）。客户实际入住当天才能确定，之后在房态图上改期即可。</div>
          </n-card>

          <n-card size="small" title="金额与收款" class="cv-card">
            <div class="cv-grid">
              <ContractField label="套餐金额（元）" required :note="noteFor('amount')" @goto-page="gotoPage"><n-input-number v-model:value="form.amountYuan" :min="0" :precision="2" style="width: 100%" @update:value="touch('amount')" /></ContractField>
              <ContractField label="订房定金（元）" :note="noteFor('depositAmount')" @goto-page="gotoPage"><n-input-number v-model:value="form.depositYuan" :min="0" :precision="2" style="width: 100%" @update:value="touch('depositAmount')" /></ContractField>
              <ContractField label="定金是否已收"><n-switch v-model:value="form.depositPaid" /></ContractField>
              <template v-if="form.depositPaid">
                <ContractField label="收款方式"><n-select v-model:value="form.depositMethod" :options="methodOptions" clearable /></ContractField>
                <ContractField label="收款日期"><n-date-picker v-model:formatted-value="form.depositPaidAt" value-format="yyyy-MM-dd" type="date" clearable style="width: 100%" /></ContractField>
              </template>
            </div>
            <div class="cv-hint">勾选“已收”并确认入库后，系统会自动生成一条收款记录；尾款到收款管理里登记。</div>
          </n-card>

          <n-card size="small" title="赠送项目" class="cv-card">
            <n-alert v-if="noteFor('items')" type="warning" style="margin-bottom: 8px">
              {{ noteFor('items')!.message }}
              <a v-if="noteFor('items')!.page" style="margin-left: 6px; cursor: pointer; text-decoration: underline" @click="gotoPage(noteFor('items')!.page!)">看第{{ noteFor('items')!.page }}页</a>
            </n-alert>
            <div v-for="(it, i) in form.items" :key="i" class="cv-item" :class="{ 'cv-item-warn': it.needsReview }">
              <n-input v-model:value="it.name" placeholder="项目名称" @update:value="touch('items')" />
              <n-input v-model:value="it.quantity" placeholder="数量/次数" @update:value="touch('items')" />
              <n-button quaternary type="error" size="small" @click="removeItem(i)">删除</n-button>
              <div v-if="it.needsReview" class="cv-item-note">AI 没看清这一项，请对照原图核对</div>
            </div>
            <div v-if="form.items.length === 0" class="cv-hint" style="margin: 0 0 8px">合同上没有手写的赠送项目（大多数合同没有）。如有，点下面按钮添加。</div>
            <n-button size="small" @click="addItem">添加赠送项目</n-button>
          </n-card>
        </fieldset>

        <div class="cv-actions">
          <n-space :wrap="true">
            <n-button v-if="canEdit && auth.hasAccess('contract.record.update')" :loading="saving" @click="save()">保存</n-button>
            <n-button v-if="reviewing && !extracting && auth.hasAccess('contract.record.confirm')" type="primary" :loading="saving" @click="openConfirm">确认并入库</n-button>
            <n-button v-if="detail.status === 'ACTIVE' && !roomAssigned" type="primary" @click="goAssignRoom">去排房</n-button>
            <n-button v-if="reviewing && !extracting && originals.length > 0 && auth.hasAccess('contract.record.upload')" @click="handleReextract">重新识别</n-button>
            <n-button v-if="reviewing && !extracting && auth.hasAccess('contract.record.delete')" type="error" quaternary @click="handleDelete">删除</n-button>
            <n-button v-if="['PENDING_REVIEW', 'ACTIVE'].includes(detail.status) && auth.hasAccess('contract.record.void')" type="error" quaternary @click="voidVisible = true">作废合同</n-button>
          </n-space>
        </div>
      </div>
    </div>

    <n-modal :mask-closable="false" :show="confirmVisible" @update:show="(v) => (confirmVisible = v)">
      <n-card title="确认入库" style="width: min(520px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <div style="margin-bottom: 8px">这份合同对应哪位客户？</div>
        <n-radio-group v-model:value="chosenCustomer" vertical>
          <n-radio v-for="m in matches" :key="m.id" :value="m.id">
            关联已有客户：{{ m.name }}（{{ m.phone }}，{{ m.customerNo }}）<n-tag size="tiny" round>{{ m.reason === 'PHONE' ? '手机号相同' : '同名' }}</n-tag>
          </n-radio>
          <n-radio value="NEW">新建客户：{{ form.clientName }}（{{ form.clientPhone }}）</n-radio>
        </n-radio-group>
        <div class="cv-hint" style="margin-top: 10px">确认后合同进入“待排房”，不能再改客户；金额、日期等仍可在合同页修改。</div>
        <template #footer>
          <n-space justify="end">
            <n-button @click="confirmVisible = false">取消</n-button>
            <n-button type="primary" :loading="confirming" @click="doConfirm">确认入库</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :mask-closable="false" :show="voidVisible" @update:show="(v) => (voidVisible = v)">
      <n-card title="作废合同" style="width: min(460px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-input v-model:value="voidReason" type="textarea" :autosize="{ minRows: 3 }" placeholder="请填写作废原因" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="voidVisible = false">取消</n-button>
            <n-button type="error" :loading="voiding" @click="doVoid">确认作废</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.cv-wrap {
  display: grid;
  grid-template-columns: minmax(340px, 44%) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.cv-viewer {
  position: sticky;
  top: 8px;
}
.cv-imgbox {
  max-height: calc(100vh - 230px);
  overflow: auto;
  border: 1px solid #eee;
  background: #fafafa;
}
.cv-imgbox img {
  display: block;
  max-width: none;
}
.cv-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cv-zoom-label {
  font-size: 12px;
  color: #888;
}
.cv-empty {
  padding: 40px 12px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
.cv-title {
  font-size: 16px;
  font-weight: 600;
}
.cv-fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.cv-card {
  margin-bottom: 10px;
}
.cv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 6px 12px;
}
.cv-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
  line-height: 1.6;
}
.cv-match {
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f5f8ff;
}
.cv-match-title {
  font-size: 13px;
  font-weight: 500;
}
.cv-match-tip {
  font-size: 12px;
  color: #666;
  line-height: 1.6;
  margin: 2px 0;
}
.cv-match-item {
  font-size: 13px;
  padding: 2px 0;
}
.cv-item {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: 8px;
  margin-bottom: 6px;
  align-items: center;
  padding: 4px;
  border-radius: 6px;
}
.cv-item-warn {
  background: #fff7e6;
  border-left: 3px solid #ef9f27;
}
.cv-item-note {
  grid-column: 1 / -1;
  font-size: 12px;
  color: #854f0b;
}
.cv-actions {
  position: sticky;
  bottom: 0;
  padding: 10px 0;
  background: #fff;
  border-top: 1px solid #eee;
  margin-top: 8px;
}
@media (max-width: 1000px) {
  .cv-wrap {
    grid-template-columns: 1fr;
  }
  .cv-viewer {
    position: static;
  }
  .cv-imgbox {
    max-height: 60vh;
  }
}
</style>
