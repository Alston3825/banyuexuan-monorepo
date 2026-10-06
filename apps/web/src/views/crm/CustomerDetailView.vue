<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
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
  NTag,
  NEmpty,
  type DataTableColumns,
} from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import { customerChannelApi } from '../../api/modules/customer-channel.api'
import { opportunityApi } from '../../api/modules/opportunity.api'
import { contractApi } from '../../api/modules/contract.api'
import { storeApi } from '../../api/modules/store.api'
import type { Customer, CustomerTagBinding } from '../../api/types/customer'
import type { SalesOpportunity } from '../../api/types/opportunity'
import type { Contract } from '../../api/types/contract'
import { renderStatusBadge, OPPORTUNITY_STAGE_MAP, CONTRACT_STATUS_MAP, CUSTOMER_SERVICE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'
import FollowUpTimeline from '../../components/crm/FollowUpTimeline.vue'
import AiCustomerServicePanel from '../../components/ai/AiCustomerServicePanel.vue'

const CLASSIFICATION_CATEGORY = 'CUSTOMER_CLASSIFICATION'
const TYPE_CATEGORY = 'CUSTOMER_TYPE'

type CatalogTag = { id: string; name: string; category: string | null; color: string | null }

const route = useRoute()
const router = useRouter()
const customerId = route.params.id as string

const customer = ref<Customer | null>(null)
const opportunities = ref<SalesOpportunity[]>([])
const contracts = ref<Contract[]>([])
// AI 客服面板需要门店；客户没有首次建档门店时，退而用系统里的第一个门店
const storeOptions = ref<{ label: string; value: string }[]>([])
const loading = ref(false)

async function fetchAll() {
  loading.value = true
  try {
    const [c, opps, cons] = await Promise.all([
      customerApi.get(customerId),
      opportunityApi.list({ customerId }),
      contractApi.list({ customerId }),
    ])
    customer.value = c
    void loadRefNames(c)
    opportunities.value = opps
    contracts.value = cons
  } finally {
    loading.value = false
  }
}

// ---------------- 编辑客户 ----------------
// 编辑是整页（和新建同一个页面，见 CustomerFormView），这里只负责跳转
function openEdit() {
  router.push(`/crm/customers/${customerId}/edit`)
}

// ---------------- 详情里需要翻译成名字的几个 id（渠道/销售员/抄送人/推荐人） ----------------
const channelTypeName = ref<string | null>(null)
const channelName = ref<string | null>(null)
const staffNames = ref<Record<string, string>>({})
const referrerText = ref<string | null>(null)

async function loadRefNames(c: Customer) {
  const [channels, types, staff] = await Promise.all([
    c.channelId ? customerChannelApi.list().catch(() => []) : Promise.resolve([]),
    c.channelTypeId ? customerChannelApi.listTypes().catch(() => []) : Promise.resolve([]),
    customerApi.staffOptions().catch(() => []),
  ])
  channelTypeName.value = types.find((x) => x.id === c.channelTypeId)?.name ?? null
  channelName.value = channels.find((x) => x.id === c.channelId)?.name ?? null
  staffNames.value = Object.fromEntries(staff.map((a) => [a.id, a.realName]))
  if (c.referrerType === 'CUSTOMER' && c.referrerId) {
    const r = await customerApi.get(c.referrerId).catch(() => null)
    referrerText.value = r ? `客户 · ${r.name}（${r.customerNo}）` : '客户（已不存在）'
  } else if (c.referrerType === 'ACCOUNT' && c.referrerId) {
    referrerText.value = `员工 · ${staffNames.value[c.referrerId] ?? '（已不存在）'}`
  } else {
    referrerText.value = null
  }
}
const staffName = (id: string | null) => (id ? staffNames.value[id] ?? '-' : '-')

// ---------------- 客户分类/客户类型标签（单选、保留变更历史） ----------------
const classificationOptions = ref<CatalogTag[]>([])
const typeOptions = ref<CatalogTag[]>([])
const activeBindings = ref<CustomerTagBinding[]>([])
const tagHistory = ref<CustomerTagBinding[]>([])
const classificationSubmitting = ref(false)
const typeSubmitting = ref(false)

const currentClassificationTagId = computed(() => activeBindings.value.find((b) => b.tag.category === CLASSIFICATION_CATEGORY)?.tagId ?? null)
const currentTypeTagId = computed(() => activeBindings.value.find((b) => b.tag.category === TYPE_CATEGORY)?.tagId ?? null)

async function fetchTags() {
  const [cls, typ, active, history] = await Promise.all([
    customerApi.tagCatalog(CLASSIFICATION_CATEGORY),
    customerApi.tagCatalog(TYPE_CATEGORY),
    customerApi.listTags(customerId),
    customerApi.listTagHistory(customerId),
  ])
  classificationOptions.value = cls
  typeOptions.value = typ
  activeBindings.value = active
  tagHistory.value = history
}

async function handleSetClassification(tagId: string | null) {
  if (!tagId) return
  classificationSubmitting.value = true
  try {
    await customerApi.setTag(customerId, CLASSIFICATION_CATEGORY, tagId)
    message.success('客户分类已更新')
    await fetchTags()
  } finally {
    classificationSubmitting.value = false
  }
}

async function handleSetType(tagId: string | null) {
  if (!tagId) return
  typeSubmitting.value = true
  try {
    await customerApi.setTag(customerId, TYPE_CATEGORY, tagId)
    message.success('客户类型已更新')
    await fetchTags()
  } finally {
    typeSubmitting.value = false
  }
}

const historyColumns: DataTableColumns<CustomerTagBinding> = [
  { key: 'category', title: '分类', render: (row) => (row.tag.category === CLASSIFICATION_CATEGORY ? '客户分类' : row.tag.category === TYPE_CATEGORY ? '客户类型' : row.tag.category ?? '-') },
  { key: 'tag', title: '标签', render: (row) => row.tag.name },
  { key: 'createdAt', title: '生效时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  { key: 'revokedAt', title: '结束时间', render: (row) => (row.revokedAt ? new Date(row.revokedAt).toLocaleString() : '生效中') },
]

// ---------------- 新建机会（customerId 锁定） ----------------
const oppVisible = ref(false)
const oppModel = ref({ amountYuan: null as number | null, remark: '' })
const oppSubmitting = ref(false)

function openCreateOpportunity() {
  oppModel.value = { amountYuan: null, remark: '' }
  oppVisible.value = true
}

async function handleCreateOpportunity() {
  oppSubmitting.value = true
  try {
    await opportunityApi.create({
      customerId,
      amount: toMinorUnits(oppModel.value.amountYuan ?? undefined),
      remark: oppModel.value.remark || undefined,
    })
    message.success('销售机会已创建')
    oppVisible.value = false
    await fetchAll()
  } finally {
    oppSubmitting.value = false
  }
}

// ---------------- 上传合同 ----------------
// 合同是纸质合同的台账：到合同管理页上传照片/PDF，AI 识别后核对确认，确认时会自动关联到客户。
function goUploadContract() {
  router.push({ path: '/contract/records', query: { upload: '1' } })
}

const opportunityColumns: DataTableColumns<SalesOpportunity> = [
  { key: 'opportunityNo', title: '机会编号' },
  { key: 'stage', title: '阶段', render: (row) => renderStatusBadge(row.stage, OPPORTUNITY_STAGE_MAP) },
  { key: 'amount', title: '金额（元）', render: (row) => (toMajorUnits(row.amount) ?? '-').toString() },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/crm/opportunities/${row.id}`) }, { default: () => '查看' }),
  },
]

const contractColumns: DataTableColumns<Contract> = [
  { key: 'paperNo', title: '合同编号', render: (row) => row.paperNo || row.contractNo },
  { key: 'signedDate', title: '签约日期', render: (row) => (row.signedDate ? row.signedDate.slice(0, 10) : '-') },
  { key: 'amount', title: '套餐金额（元）', render: (row) => toMajorUnits(row.amount) },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CONTRACT_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/contract/records/${row.id}`) }, { default: () => '查看' }),
  },
]

onMounted(async () => {
  await fetchAll()
  await fetchTags()
  const stores = await storeApi.list()
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
})
</script>

<template>
  <div v-if="customer">
    <n-card :title="customer.name" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" @click="openEdit">编辑</n-button>
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="客户编号">{{ customer.customerNo }}</n-descriptions-item>
        <n-descriptions-item label="手机号">{{ customer.phone }}</n-descriptions-item>
        <n-descriptions-item label="微信">{{ customer.wechat ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="渠道">
          {{ channelTypeName ?? '-' }}{{ channelName ? ` · ${channelName}` : '' }}
        </n-descriptions-item>
        <n-descriptions-item label="客户类型">
          {{ customer.serviceTypes?.length ? customer.serviceTypes.map((t) => CUSTOMER_SERVICE_TYPE_LABEL_MAP[t] ?? t).join('、') : '-' }}
        </n-descriptions-item>
        <n-descriptions-item label="建卡/产检医院">{{ customer.hospital ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="预产期">{{ customer.expectedDueDate ? new Date(customer.expectedDueDate).toLocaleDateString() : '-' }}</n-descriptions-item>
        <n-descriptions-item label="妈妈生日">{{ customer.birthday ? customer.birthday.slice(0, 10) : '-' }}</n-descriptions-item>
        <n-descriptions-item label="妈妈身份证">{{ customer.idCardNo ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="国际证件号">{{ customer.passportNo ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="HIS登记号">{{ customer.hisNo ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="片区">{{ customer.zone ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="地区">{{ customer.region ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="详细地址">{{ customer.address ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="亲属">
          {{ customer.emergencyContactName ? `${customer.emergencyContactName}${customer.emergencyContactRelation ? `（${customer.emergencyContactRelation}）` : ''} ${customer.emergencyContactPhone ?? ''}` : '-' }}
        </n-descriptions-item>
        <n-descriptions-item label="推荐人">{{ referrerText ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="电话销售员">{{ staffName(customer.phoneSalesId) }}</n-descriptions-item>
        <n-descriptions-item label="门店销售员">{{ staffName(customer.assignedToId) }}</n-descriptions-item>
        <n-descriptions-item label="抄送人">
          {{ customer.ccAccountIds?.length ? customer.ccAccountIds.map((id) => staffName(id)).join('、') : '-' }}
        </n-descriptions-item>
        <n-descriptions-item label="添加时间">{{ new Date(customer.registeredAt).toLocaleString() }}</n-descriptions-item>
        <n-descriptions-item label="备注" :span="2"><span style="white-space: pre-wrap">{{ customer.remark ?? '-' }}</span></n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="客户分类 / 客户类型" style="margin-bottom: 16px">
      <n-space vertical :size="16">
        <n-space align="center" :size="12">
          <span style="width: min(80px, 94vw); color: var(--n-text-color-3, #999)">客户分类</span>
          <n-tag v-if="currentClassificationTagId" type="primary">
            {{ classificationOptions.find((o) => o.id === currentClassificationTagId)?.name }}
          </n-tag>
          <n-tag v-else type="default">未设置</n-tag>
          <n-select
            :value="currentClassificationTagId"
            :options="classificationOptions.map((o) => ({ label: o.name, value: o.id }))"
            placeholder="设置客户分类"
            style="width: min(200px, 94vw)"
            :loading="classificationSubmitting"
            @update:value="handleSetClassification"
          />
        </n-space>
        <n-space align="center" :size="12">
          <span style="width: min(80px, 94vw); color: var(--n-text-color-3, #999)">客户类型</span>
          <n-tag v-if="currentTypeTagId" type="primary">
            {{ typeOptions.find((o) => o.id === currentTypeTagId)?.name }}
          </n-tag>
          <n-tag v-else type="default">未设置</n-tag>
          <n-select
            :value="currentTypeTagId"
            :options="typeOptions.map((o) => ({ label: o.name, value: o.id }))"
            placeholder="设置客户类型"
            style="width: min(200px, 94vw)"
            :loading="typeSubmitting"
            @update:value="handleSetType"
          />
        </n-space>
        <n-data-table
          v-if="tagHistory.length"
          size="small"
          :columns="historyColumns"
          :data="tagHistory"
          :row-key="(r: CustomerTagBinding) => r.id"
        />
        <n-empty v-else description="暂无标签变更记录" size="small" />
      </n-space>
    </n-card>

    <n-card title="销售机会" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" type="primary" @click="openCreateOpportunity">新建机会</n-button>
      </template>
      <n-data-table :columns="opportunityColumns" :data="opportunities" :row-key="(r: SalesOpportunity) => r.id" />
    </n-card>

    <n-card title="合同" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button size="small" type="primary" @click="goUploadContract">上传合同</n-button>
      </template>
      <n-data-table :columns="contractColumns" :data="contracts" :row-key="(r: Contract) => r.id" />
    </n-card>

    <AiCustomerServicePanel
      v-if="customer"
      business-type="CUSTOMER"
      :business-id="customerId"
      :store-id="customer.primaryStoreId ?? storeOptions[0]?.value ?? ''"
    />

    <FollowUpTimeline business-type="CUSTOMER" :business-id="customerId" />


    <n-modal :show="oppVisible" @update:show="(v) => (oppVisible = v)">
      <n-card title="新建销售机会" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="意向金额（元）"><n-input-number v-model:value="oppModel.amountYuan" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="oppModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="oppVisible = false">取消</n-button>
            <n-button type="primary" :loading="oppSubmitting" @click="handleCreateOpportunity">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

  </div>
</template>
