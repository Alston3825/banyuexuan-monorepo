<script setup lang="ts">
/**
 * 新添客户 / 编辑客户（整页，版式参照行业系统的"新添客户（客户基本信息）"页）。
 * 新建路由 /crm/customers/new，编辑路由 /crm/customers/:id/edit，同一个页面两种模式。
 * 字段与数据的对应关系见各表单项旁的注释和 docs 里的字段对照说明。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import {
  NButton, NCheckbox, NCheckboxGroup, NDatePicker, NForm, NFormItem, NInput, NSelect, NSpace, NTag, NSpin,
  type FormInst, type FormRules, type SelectOption,
} from 'naive-ui'
import { useCascaderAreaData } from '@vant/area-data'
import { customerApi } from '../../api/modules/customer.api'
import { customerChannelApi } from '../../api/modules/customer-channel.api'
import { storeApi } from '../../api/modules/store.api'
import type { Customer, CustomerChannel, CustomerChannelType, CustomerServiceType, ReferrerType, StaffOption } from '../../api/types/customer'
import { CUSTOMER_SERVICE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const editingId = computed(() => (route.params.id as string | undefined) ?? null)
const isEdit = computed(() => !!editingId.value)
const myId = computed(() => auth.account?.id ?? null)

const loading = ref(false)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const original = ref<Customer | null>(null)

// ---------------- 表单数据 ----------------
const model = reactive({
  name: '',
  allowDuplicatePhone: false,
  phone: '',
  wechat: '',
  salutation: '',
  channelTypeId: null as string | null, // 渠道类型（客户渠道页里维护，可自定义）
  channelId: null as string | null, // 具体渠道
  serviceTypes: [] as CustomerServiceType[],
  hospital: '',
  expectedDueDate: null as number | null,
  idCardNo: '',
  birthday: null as number | null,
  dietTaboo: '',
  allergens: '',
  provinceCode: null as string | null,
  cityCode: null as string | null,
  districtCode: null as string | null,
  address: '',
  zone: '',
  hisNo: '',
  passportNo: '',
  remark: '',
  ccAccountIds: [] as string[],
  registeredAt: Date.now() as number | null,
  primaryStoreId: null as string | null,
  emergencyContactName: '',
  emergencyContactRelation: '',
  emergencyContactPhone: '',
  referrerKey: null as string | null, // "CUSTOMER:<id>" / "ACCOUNT:<id>"
  phoneSalesId: null as string | null,
  assignedToId: null as string | null, // 门店销售员
})

const serviceTypeOptions = Object.entries(CUSTOMER_SERVICE_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))

// ---------------- 渠道（类型 → 具体渠道联动） ----------------
const channelTypes = ref<CustomerChannelType[]>([])
const typeOptions = computed<SelectOption[]>(() =>
  channelTypes.value
    .filter((t) => t.status === 'ACTIVE' || t.id === original.value?.channelTypeId)
    .map((t) => ({ label: t.status === 'ACTIVE' ? t.name : `${t.name}（已停用）`, value: t.id })),
)
const channels = ref<CustomerChannel[]>([])
const channelOptions = computed<SelectOption[]>(() =>
  channels.value
    .filter((c) => c.typeId === model.channelTypeId && (c.status === 'ACTIVE' || c.id === original.value?.channelId))
    .map((c) => ({ label: c.status === 'ACTIVE' ? c.name : `${c.name}（已停用）`, value: c.id })),
)
function onChannelTypeChange() {
  model.channelId = null // 换了渠道类型，原来选的具体渠道不再适用
}

// ---------------- 省/市/区三级下拉 ----------------
interface AreaNode { text: string; value: string; children?: AreaNode[] }
const areaTree = useCascaderAreaData() as AreaNode[]
const provinceOptions = areaTree.map((p) => ({ label: p.text, value: p.value }))
const cityOptions = computed(() => (areaTree.find((p) => p.value === model.provinceCode)?.children ?? []).map((c) => ({ label: c.text, value: c.value })))
const districtOptions = computed(() => {
  const city = areaTree.find((p) => p.value === model.provinceCode)?.children?.find((c) => c.value === model.cityCode)
  return (city?.children ?? []).map((d) => ({ label: d.text, value: d.value }))
})
/** 老数据里的地区是一段自由文本，解析不出来时保留原文，用户没改选择就原样保存。 */
const legacyRegion = ref<string | null>(null)
function onProvinceChange() {
  model.cityCode = null
  model.districtCode = null
  legacyRegion.value = null
}
function onCityChange() {
  model.districtCode = null
  legacyRegion.value = null
}
function regionText(): string | null {
  const p = areaTree.find((x) => x.value === model.provinceCode)
  if (!p) return legacyRegion.value
  const c = p.children?.find((x) => x.value === model.cityCode)
  const d = c?.children?.find((x) => x.value === model.districtCode)
  // 直辖市的"市"和省同名（北京市/北京市），不重复拼
  return [p.text, c && c.text !== p.text ? c.text : '', d?.text ?? ''].join('') || null
}
function parseRegion(text: string | null) {
  legacyRegion.value = null
  if (!text) return
  const p = areaTree.find((x) => text.startsWith(x.text))
  if (!p) {
    legacyRegion.value = text
    return
  }
  model.provinceCode = p.value
  let rest = text.slice(p.text.length)
  const c = p.children?.find((x) => rest.startsWith(x.text)) ?? (p.children?.length === 1 ? p.children[0] : undefined)
  if (c) {
    model.cityCode = c.value
    if (rest.startsWith(c.text)) rest = rest.slice(c.text.length)
    const d = c.children?.find((x) => rest.startsWith(x.text))
    if (d) model.districtCode = d.value
  }
}

// ---------------- 日期工具 ----------------
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** 'YYYY-MM-DD...' → 当天本地零点的时间戳（日期型字段不做时区换算） */
const fromYmd = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// ---------------- 身份证：校验 + 生日自动算 ----------------
const idChecking = ref(false)
let maleWarnedFor = '' // 同一个号码只在失焦时自动弹一次，免得来回切换焦点反复打扰；点"身份证号码验证"按钮每次都弹
async function verifyIdCard(silentWhenEmpty = false) {
  const no = model.idCardNo.trim()
  if (!no) {
    if (!silentWhenEmpty) message.warning('请先填写妈妈身份证号')
    return
  }
  idChecking.value = true
  try {
    const r = await customerApi.idCardCheck(no)
    if (r.valid) {
      model.idCardNo = r.normalized
      if (r.birthday) model.birthday = fromYmd(r.birthday)
      message.success(`身份证号码有效，妈妈生日 ${r.birthday}`)
      if (r.gender === 'MALE' && !(silentWhenEmpty && maleWarnedFor === r.normalized)) {
        maleWarnedFor = r.normalized
        dialog.warning({
          title: '身份证号码是男性',
          content: '这个身份证号码识别为男性（第 17 位是奇数）。这里要填的是产妇（妈妈）本人的身份证，请核对是不是填成了爸爸/家属的号码，或输错了。',
          positiveText: '我知道了，去核对',
        })
      }
    } else {
      message.error(r.reason ?? '身份证号码不正确')
    }
  } finally {
    idChecking.value = false
  }
}

// ---------------- 手机号查重提示 ----------------
const phoneDup = ref<Customer[]>([])
async function checkPhone() {
  phoneDup.value = []
  if (!/^1[3-9]\d{9}$/.test(model.phone)) return
  const list = await customerApi.list({ keyword: model.phone })
  phoneDup.value = list.filter((c) => c.phone === model.phone && c.id !== editingId.value)
}

// ---------------- 员工 / 推荐人选择器 ----------------
const staffMap = reactive<Record<string, StaffOption>>({})
const staffShown = ref<StaffOption[]>([])
const staffLabel = (a: StaffOption) => `${a.realName}（${a.username}）`
function rememberStaff(list: StaffOption[]) {
  list.forEach((a) => (staffMap[a.id] = a))
}
async function searchStaff(keyword = '') {
  const list = await customerApi.staffOptions(keyword)
  rememberStaff(list)
  staffShown.value = list
}
// 电话销售员 / 门店销售员只从销售部里选
const salesShown = ref<StaffOption[]>([])
async function searchSales(keyword = '') {
  const list = await customerApi.staffOptions(keyword, true)
  rememberStaff(list)
  salesShown.value = list
}
/** 当前列表 + 已选中的人（搜索后列表变了，已选的也要保留显示，否则标签会变成一串 id）。 */
function staffSelectOptions(selected: (string | null)[]): SelectOption[] {
  const ids = new Set(staffShown.value.map((a) => a.id))
  const extra = selected.filter((id): id is string => !!id && !ids.has(id) && !!staffMap[id]).map((id) => staffMap[id])
  return [...staffShown.value, ...extra].map((a) => ({ label: staffLabel(a), value: a.id }))
}
const ccOptions = computed(() => staffSelectOptions(model.ccAccountIds))
function salesSelectOptions(selected: (string | null)[]): SelectOption[] {
  const ids = new Set(salesShown.value.map((a) => a.id))
  const extra = selected.filter((id): id is string => !!id && !ids.has(id) && !!staffMap[id]).map((id) => staffMap[id])
  return [...salesShown.value, ...extra].map((a) => ({ label: staffLabel(a), value: a.id }))
}
const phoneSalesOptions = computed(() => salesSelectOptions([model.phoneSalesId]))
const storeSalesOptions = computed(() => salesSelectOptions([model.assignedToId]))

const referrerLabels = reactive<Record<string, string>>({})
const referrerShown = ref<SelectOption[]>([])
let referrerTimer: number | undefined
function searchReferrer(keyword: string) {
  window.clearTimeout(referrerTimer)
  if (!keyword.trim()) {
    referrerShown.value = []
    return
  }
  referrerTimer = window.setTimeout(async () => {
    const r = await customerApi.referrerSearch(keyword.trim())
    const toOpt = (key: string, label: string): SelectOption => {
      referrerLabels[key] = label
      return { label, value: key }
    }
    const groups: SelectOption[] = []
    if (r.customers.length) {
      groups.push({ type: 'group', label: '客户', key: 'g-c', children: r.customers.map((c) => toOpt(`CUSTOMER:${c.id}`, `${c.name}（${c.phone}，${c.customerNo}）`)) })
    }
    if (r.accounts.length) {
      groups.push({ type: 'group', label: '员工', key: 'g-a', children: r.accounts.map((a) => toOpt(`ACCOUNT:${a.id}`, `${a.realName}（${a.username}）`)) })
    }
    referrerShown.value = groups
  }, 250)
}
const referrerOptions = computed<SelectOption[]>(() => {
  const k = model.referrerKey
  if (k && referrerLabels[k] && !JSON.stringify(referrerShown.value).includes(`"${k}"`)) {
    return [...referrerShown.value, { label: referrerLabels[k], value: k }]
  }
  return referrerShown.value
})

// ---------------- 客户分配（分配我为…） ----------------
const iAmPhoneSales = computed({
  get: () => !!myId.value && model.phoneSalesId === myId.value,
  set: (v: boolean) => (model.phoneSalesId = v ? myId.value : model.phoneSalesId === myId.value ? null : model.phoneSalesId),
})
const iAmStoreSales = computed({
  get: () => !!myId.value && model.assignedToId === myId.value,
  set: (v: boolean) => (model.assignedToId = v ? myId.value : model.assignedToId === myId.value ? null : model.assignedToId),
})

// ---------------- 门店 ----------------
const storeOptions = ref<{ label: string; value: string }[]>([])

// ---------------- 校验规则 ----------------
const rules: FormRules = {
  name: { required: true, message: '请输入客户姓名', trigger: ['blur', 'input'] },
  phone: [
    { required: true, message: '请输入手机号', trigger: ['blur', 'input'] },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确（11位）', trigger: ['blur'] },
  ],
  channelTypeId: { required: true, message: '请选择渠道类型', trigger: ['change'] },
  channelId: {
    trigger: ['change'],
    validator: () => (channelOptions.value.length > 0 && !model.channelId ? new Error('请选择具体渠道') : true),
  },
  serviceTypes: { type: 'array', required: true, min: 1, message: '请至少选择一个客户类型', trigger: ['change'] },
}

// ---------------- 提交 ----------------
const emptyToNull = (v: string) => (v.trim() ? v.trim() : null)

function buildPayload() {
  const referrer = model.referrerKey ? (model.referrerKey.split(':') as [ReferrerType, string]) : null
  return {
    name: model.name.trim(),
    phone: model.phone.trim(),
    allowDuplicatePhone: model.allowDuplicatePhone || undefined,
    channelTypeId: model.channelTypeId as string,
    channelId: model.channelId,
    wechat: emptyToNull(model.wechat),
    salutation: emptyToNull(model.salutation),
    serviceTypes: model.serviceTypes,
    hospital: emptyToNull(model.hospital),
    expectedDueDate: model.expectedDueDate ? new Date(model.expectedDueDate).toISOString() : null,
    idCardNo: emptyToNull(model.idCardNo),
    birthday: model.birthday ? ymd(model.birthday) : null,
    dietTaboo: emptyToNull(model.dietTaboo),
    allergens: emptyToNull(model.allergens),
    region: regionText(),
    address: emptyToNull(model.address),
    zone: emptyToNull(model.zone),
    hisNo: emptyToNull(model.hisNo),
    passportNo: emptyToNull(model.passportNo),
    remark: emptyToNull(model.remark),
    ccAccountIds: model.ccAccountIds.length ? model.ccAccountIds : null,
    registeredAt: model.registeredAt ? new Date(model.registeredAt).toISOString() : undefined,
    emergencyContactName: emptyToNull(model.emergencyContactName),
    emergencyContactRelation: emptyToNull(model.emergencyContactRelation),
    emergencyContactPhone: emptyToNull(model.emergencyContactPhone),
    referrerType: referrer ? referrer[0] : null,
    referrerId: referrer ? referrer[1] : null,
    phoneSalesId: model.phoneSalesId,
    assignedToId: model.assignedToId,
  }
}

/** 创建时没填的项直接不传（null 在创建接口里没有"清空"的意义）。 */
function stripNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>
}

async function submit(after: 'detail' | 'purchase') {
  try {
    await formRef.value?.validate()
  } catch {
    message.error('请先把标红的必填项填写完整')
    return
  }
  if (!isEdit.value && phoneDup.value.length > 0 && !model.allowDuplicatePhone) {
    message.error(`手机号已被客户「${phoneDup.value[0].name}」使用；如果是再次入住的妈妈，请勾选“再次入住妈妈，允许号码重复”`)
    return
  }
  submitting.value = true
  try {
    const payload = buildPayload()
    let id: string
    if (isEdit.value) {
      const updated = await customerApi.update(editingId.value!, { ...payload, version: original.value!.version })
      id = updated.id
      message.success('客户已保存')
    } else {
      const created = await customerApi.create({
        ...(stripNulls(payload) as typeof payload),
        primaryStoreId: model.primaryStoreId ?? undefined,
      } as Parameters<typeof customerApi.create>[0])
      id = created.id
      message.success('客户已创建')
    }
    if (after === 'purchase' && !isEdit.value) {
      // 月子套餐靠纸质合同签约：直接带到"上传合同"，识别后核对确认时会自动关联到这位客户
      router.push({ path: '/contract/records', query: { upload: '1' } })
    } else {
      router.push(`/crm/customers/${id}`)
    }
  } finally {
    submitting.value = false
  }
}

// ---------------- 加载 ----------------
async function loadForEdit(id: string) {
  const c = await customerApi.get(id)
  original.value = c
  model.name = c.name
  model.phone = c.phone
  model.wechat = c.wechat ?? ''
  model.salutation = c.salutation ?? ''
  model.channelTypeId = c.channelTypeId
  model.channelId = c.channelId
  model.serviceTypes = c.serviceTypes ?? []
  model.hospital = c.hospital ?? ''
  model.expectedDueDate = c.expectedDueDate ? new Date(c.expectedDueDate).getTime() : null
  model.idCardNo = c.idCardNo ?? ''
  model.birthday = c.birthday ? fromYmd(c.birthday) : null
  model.dietTaboo = c.dietTaboo ?? ''
  model.allergens = c.allergens ?? ''
  parseRegion(c.region)
  model.address = c.address ?? ''
  model.zone = c.zone ?? ''
  model.hisNo = c.hisNo ?? ''
  model.passportNo = c.passportNo ?? ''
  model.remark = c.remark ?? ''
  model.ccAccountIds = c.ccAccountIds ?? []
  model.registeredAt = new Date(c.registeredAt).getTime()
  model.primaryStoreId = c.primaryStoreId
  model.emergencyContactName = c.emergencyContactName ?? ''
  model.emergencyContactRelation = c.emergencyContactRelation ?? ''
  model.emergencyContactPhone = c.emergencyContactPhone ?? ''
  model.phoneSalesId = c.phoneSalesId
  model.assignedToId = c.assignedToId
  if (c.referrerType && c.referrerId) {
    const key = `${c.referrerType}:${c.referrerId}`
    model.referrerKey = key
    if (c.referrerType === 'CUSTOMER') {
      const r = await customerApi.get(c.referrerId).catch(() => null)
      referrerLabels[key] = r ? `${r.name}（${r.phone}，${r.customerNo}）` : '（该客户已不存在）'
    } else {
      const a = staffMap[c.referrerId]
      referrerLabels[key] = a ? `${a.realName}（${a.username}）` : '（该员工已不存在）'
    }
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const [stores, chans, types] = await Promise.all([storeApi.list(), customerChannelApi.list(), customerChannelApi.listTypes(), searchStaff(''), searchSales('')])
    storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
    channels.value = chans
    channelTypes.value = types
    if (isEdit.value) await loadForEdit(editingId.value!)
    else model.primaryStoreId = stores[0]?.id ?? null
  } finally {
    loading.value = false
  }
})

const pageTitle = computed(() => (isEdit.value ? '编辑客户' : '新添客户'))
</script>

<template>
  <n-spin :show="loading">
    <div class="cf-page">
      <!-- 面包屑 + 返回 -->
      <div class="cf-crumb">
        <span class="cf-crumb-text">当前位置：客户管理 &gt; {{ pageTitle }}</span>
        <router-link :to="isEdit ? `/crm/customers/${editingId}` : '/crm/customers'">
          <n-button size="tiny" secondary type="primary">{{ isEdit ? '返回客户详情' : '返回客户列表' }}</n-button>
        </router-link>
      </div>

      <div class="cf-head">
        <span class="cf-head-title">{{ pageTitle }}（客户基本信息）</span>
        <n-button size="small" color="#c96f4f" :loading="idChecking" @click="verifyIdCard()">身份证号码验证</n-button>
        <n-button size="small" type="info" disabled title="需要连接身份证读卡器硬件，暂不支持">身份证读卡快录</n-button>
      </div>

      <n-form ref="formRef" :model="model" :rules="rules" label-placement="left" label-width="130" label-align="right" require-mark-placement="right" class="cf-form">
        <n-form-item label="客户姓名：" path="name">
          <n-space align="center" :size="12">
            <n-input v-model:value="model.name" style="width: 250px" />
            <!-- 图中是一个固定勾选且不可改的"妈妈本人"，本系统的客户档案就是妈妈本人，作为固定标记展示 -->
            <n-checkbox :checked="true" disabled>妈妈本人</n-checkbox>
          </n-space>
        </n-form-item>

        <n-form-item label=" " :show-feedback="false" class="cf-tight">
          <n-checkbox v-model:checked="model.allowDuplicatePhone">再次入住妈妈，允许号码重复</n-checkbox>
        </n-form-item>

        <n-form-item label="手机：" path="phone">
          <div>
            <n-input v-model:value="model.phone" style="width: 250px" maxlength="11" @blur="checkPhone" />
            <div v-if="phoneDup.length > 0" class="cf-warn">
              该手机号已有客户：
              <template v-for="c in phoneDup.slice(0, 3)" :key="c.id">
                <router-link :to="`/crm/customers/${c.id}`" target="_blank">{{ c.name }}（{{ c.customerNo }}）</router-link>
                <span>&nbsp;</span>
              </template>
              <b v-if="!model.allowDuplicatePhone">——如果是再次入住的妈妈，请勾选上面的“允许号码重复”</b>
              <b v-else>——已勾选“允许号码重复”，可以继续</b>
            </div>
          </div>
        </n-form-item>

        <n-form-item label="宝妈称呼：">
          <n-space align="center" :size="12">
            <n-input v-model:value="model.salutation" style="width: 250px" placeholder="如 小雨妈妈（选填）" />
            <span class="cf-hint">（房间平板、护理师手表上用它称呼客户，不填则按“姓+女士”）</span>
          </n-space>
        </n-form-item>

        <n-form-item label="微信：">
          <n-space align="center" :size="12">
            <n-input v-model:value="model.wechat" style="width: 250px" />
            <span class="cf-hint">（同“手机”不能同时为空）</span>
          </n-space>
        </n-form-item>

        <!-- 渠道：左边是渠道类型，右边是具体渠道（都在“客户渠道”页里维护，可自定义） -->
        <n-form-item label="渠道：" required path="channelTypeId">
          <n-space :size="8">
            <n-select v-model:value="model.channelTypeId" :options="typeOptions" placeholder="请选择渠道类型" style="width: 160px" @update:value="onChannelTypeChange" />
            <n-form-item path="channelId" :show-label="false" :show-feedback="false" style="display: inline-flex">
              <n-select
                v-model:value="model.channelId"
                :options="channelOptions"
                :placeholder="!model.channelTypeId ? '请先选渠道类型' : channelOptions.length ? '请选择渠道' : '该类型下暂无具体渠道'"
                :disabled="!model.channelTypeId || channelOptions.length === 0"
                clearable
                style="width: 190px"
              />
            </n-form-item>
          </n-space>
        </n-form-item>

        <n-form-item label="客户类型：" path="serviceTypes" required>
          <n-checkbox-group v-model:value="model.serviceTypes">
            <n-space :size="[14, 6]">
              <n-checkbox v-for="opt in serviceTypeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
            </n-space>
          </n-checkbox-group>
        </n-form-item>

        <n-form-item label="建卡/产检医院：">
          <n-input v-model:value="model.hospital" style="width: 250px" />
        </n-form-item>

        <n-form-item label="妈妈预产期：">
          <n-date-picker v-model:value="model.expectedDueDate" type="date" clearable style="width: 250px" />
        </n-form-item>

        <n-form-item label="妈妈身份证：">
          <n-space align="center" :size="12">
            <n-input v-model:value="model.idCardNo" style="width: 250px" maxlength="18" @blur="verifyIdCard(true)" />
            <span class="cf-hint">（自动计算生日）</span>
          </n-space>
        </n-form-item>

        <n-form-item label="妈妈生日：">
          <n-date-picker v-model:value="model.birthday" type="date" clearable style="width: 250px" />
        </n-form-item>

        <n-form-item label="过敏源：">
          <n-input v-model:value="model.allergens" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" maxlength="180" show-count placeholder="如：青霉素、海鲜、花粉；没有可不填" style="max-width: 420px" />
        </n-form-item>

        <n-form-item label="饮食禁忌：">
          <n-input v-model:value="model.dietTaboo" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" maxlength="180" show-count placeholder="如：忌辛辣、对海鲜过敏、不吃羊肉" style="max-width: 420px" />
        </n-form-item>

        <n-form-item label="地区：">
          <div>
            <n-space :size="8">
              <n-select v-model:value="model.provinceCode" :options="provinceOptions" placeholder="<默认省>" clearable filterable style="width: 130px" @update:value="onProvinceChange" />
              <n-select v-model:value="model.cityCode" :options="cityOptions" placeholder="<默认市>" clearable filterable :disabled="!model.provinceCode" style="width: 130px" @update:value="onCityChange" />
              <n-select v-model:value="model.districtCode" :options="districtOptions" placeholder="<默认区>" clearable filterable :disabled="!model.cityCode" style="width: 130px" @update:value="legacyRegion = null" />
            </n-space>
            <div v-if="legacyRegion" class="cf-hint">原有地区「{{ legacyRegion }}」无法对应到下拉选项，不重新选择就保持原样</div>
          </div>
        </n-form-item>

        <n-form-item label="地址：">
          <n-input v-model:value="model.address" style="width: 250px" />
        </n-form-item>

        <n-form-item label="片区：">
          <n-space align="center" :size="12">
            <n-input v-model:value="model.zone" placeholder="输入名称" style="width: 250px" />
            <span class="cf-hint">（锦业路商圈、大都荟商圈）</span>
          </n-space>
        </n-form-item>

        <n-form-item label="HIS登记号：">
          <n-input v-model:value="model.hisNo" style="width: 250px" />
        </n-form-item>

        <n-form-item label="国际证件号：">
          <n-input v-model:value="model.passportNo" style="width: 250px" />
        </n-form-item>

        <n-form-item label="备注：">
          <n-input v-model:value="model.remark" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" style="width: 300px" />
        </n-form-item>

        <n-form-item label="抄送人：">
          <n-space align="center" :size="8">
            <n-select
              v-model:value="model.ccAccountIds"
              :options="ccOptions"
              multiple
              filterable
              remote
              clearable
              :clear-filter-after-select="true"
              placeholder="输入简拼/姓名检索"
              style="width: 300px"
              @search="searchStaff"
            />
            <span class="cf-hint">（系统暂无站内通知，目前只记录并在客户详情展示）</span>
          </n-space>
        </n-form-item>

        <n-form-item label="添加时间：">
          <n-date-picker v-model:value="model.registeredAt" type="datetime" style="width: 250px" />
        </n-form-item>

        <n-form-item v-if="!isEdit" label="建档门店：">
          <n-select v-model:value="model.primaryStoreId" :options="storeOptions" clearable style="width: 250px" />
        </n-form-item>

        <!-- 黄色底的这一块：亲属、推荐人、客户分配 -->
        <div class="cf-yellow">
          <n-form-item label="亲属姓名：">
            <n-input v-model:value="model.emergencyContactName" style="width: 200px" />
          </n-form-item>
          <n-form-item label="(与产妇)关系：">
            <n-input v-model:value="model.emergencyContactRelation" style="width: 200px" />
          </n-form-item>
          <n-form-item label="亲属电话：">
            <n-input v-model:value="model.emergencyContactPhone" style="width: 200px" />
          </n-form-item>
          <n-form-item label="推荐人：">
            <n-select
              v-model:value="model.referrerKey"
              :options="referrerOptions"
              filterable
              remote
              clearable
              placeholder="输入简拼/姓名/手机号检索（客户或员工）"
              style="width: 300px"
              @search="searchReferrer"
            />
          </n-form-item>
          <n-form-item label="客户分配：">
            <div>
              <n-space vertical :size="6">
                <n-checkbox v-model:checked="iAmPhoneSales">分配我为 电话销售员</n-checkbox>
                <n-checkbox v-model:checked="iAmStoreSales">分配我为 门店销售员</n-checkbox>
              </n-space>
              <n-space :size="12" style="margin-top: 8px" align="center">
                <span class="cf-hint">或指定：</span>
                <n-select v-model:value="model.phoneSalesId" :options="phoneSalesOptions" placeholder="电话销售员（销售部）" clearable filterable remote style="width: 190px" @search="searchSales" />
                <n-select v-model:value="model.assignedToId" :options="storeSalesOptions" placeholder="门店销售员（销售部）" clearable filterable remote style="width: 190px" @search="searchSales" />
              </n-space>
              <div v-if="!isEdit" class="cf-hint" style="margin-top: 4px">不指定门店销售员时，默认归属为录入人本人。</div>
            </div>
          </n-form-item>
        </div>

        <div class="cf-actions">
          <template v-if="isEdit">
            <n-button type="primary" :loading="submitting" @click="submit('detail')">保存，返回客户详情</n-button>
            <n-button @click="router.push(`/crm/customers/${editingId}`)">取消</n-button>
          </template>
          <template v-else>
            <n-button type="info" :loading="submitting" @click="submit('detail')">提交，到客户详情</n-button>
            <n-button color="#c96f4f" :loading="submitting" @click="submit('purchase')">提交，去购买服务</n-button>
          </template>
          <n-tag v-if="!isEdit" size="small" :bordered="false">“去购买服务”会带你到合同管理上传这位客户的合同</n-tag>
        </div>
      </n-form>
    </div>
  </n-spin>
</template>

<style scoped>
.cf-page {
  max-width: 980px;
}
.cf-crumb {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 10px;
  font-size: 13px;
  color: #6f6a62;
  border-bottom: 1px solid #eeebe3;
  margin-bottom: 12px;
}
.cf-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-left: 8px;
  border-left: 3px solid #c96f4f;
}
.cf-head-title {
  font-size: 14px;
  font-weight: 600;
  color: #5b83aa;
  margin-right: 8px;
}
.cf-hint {
  font-size: 12px;
  color: #86817a;
}
.cf-warn {
  margin-top: 4px;
  font-size: 12px;
  color: #9a4f33;
  line-height: 1.6;
}
.cf-tight :deep(.n-form-item-blank) {
  min-height: 0;
}
.cf-yellow {
  margin: 8px 0 12px;
  padding: 12px 8px 4px;
  max-width: 760px;
  background: #e9d9c3;
  border-radius: 4px;
}
.cf-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 24px 130px;
}
@media (max-width: 720px) {
  .cf-actions {
    padding-left: 0;
    flex-wrap: wrap;
  }
  /* 手机宽度：标签收窄，输入框不超出屏幕（输入框宽度是行内写死的，用 max-width 压住） */
  .cf-form :deep(.n-form-item-label) {
    width: 84px !important;
  }
  .cf-form :deep(.n-input),
  .cf-form :deep(.n-select),
  .cf-form :deep(.n-date-picker),
  .cf-form :deep(.n-space) {
    max-width: 100%;
  }
}
</style>
