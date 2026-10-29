<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NEmpty,
  NSpace,
  NDataTable,
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NDatePicker,
  NDynamicInput,
  NRadioButton,
  NRadioGroup,
  type DataTableColumns,
} from 'naive-ui'
import { motherProfileApi } from '../../api/modules/care.api'
import { customerApi } from '../../api/modules/customer.api'
import { roomOccupancyApi } from '../../api/modules/room-occupancy.api'
import { tagApi } from '../../api/modules/tag.api'
import type { BabyProfileInput, DeliveryMethod, MotherProfile } from '../../api/types/care'
import type { Customer } from '../../api/types/customer'
import type { RoomOccupancy } from '../../api/types/room-occupancy'
import type { Tag } from '../../api/types/tag'
import { BABY_GENDER_LABEL_MAP, DELIVERY_METHOD_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'
import { useAuthStore } from '../../stores/auth'
import RecordRemovalDialog from '../../components/crm/RecordRemovalDialog.vue'

const router = useRouter()

const rows = ref<MotherProfile[]>([])
const customers = ref<Customer[]>([])
const tags = ref<Tag[]>([])
const loading = ref(false)

// 手机宽度（≤720px）改成卡片列表，不用左右滑表格
const mq = window.matchMedia('(max-width: 720px)')
const isMobile = ref(mq.matches)
const onMq = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mq.addEventListener('change', onMq)
onBeforeUnmount(() => mq.removeEventListener('change', onMq))

const keyword = ref('')

const customerNameById = computed(() => new Map(customers.value.map((c) => [c.id, c.name])))
const customerOptions = computed(() => customers.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })))
// 风险标签只能选“母婴风险”分类的标签（早产/传染病/高敏…），不能混进销售用的客户分类、客户类型
const tagOptions = computed(() => tags.value.filter((t) => t.category === 'CARE_RISK').map((t) => ({ label: t.name, value: t.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  customerId: null as string | null,
  occupancyId: null as string | null,
  deliveryMethod: 'UNKNOWN' as DeliveryMethod,
  deliveryDate: null as number | null,
  gestationalWeeks: null as number | null,
  expectedDeliveryDate: null as number | null,
  careNote: '',
  allergens: '',
  remark: '',
  riskTagIds: [] as string[],
  babies: [] as (BabyProfileInput & { key: number })[],
})
let babyRowKey = 0

// 建档时关联到具体的入住记录，护理看板才能按 occupancyId 把母婴档案匹配到对应房间卡片上
// （见 MotherProfile 模型注释："再次入住"新建档案也是靠这个字段区分）。只列这位客户
// 还没结束的入住（预订中/已入住），不强制必填——先建档、入住后再补关联也可以。
const customerOccupancies = ref<RoomOccupancy[]>([])
const occupancyOptions = computed(() =>
  customerOccupancies.value.map((o) => ({
    label: `${o.occupancyNo}（${o.status === 'CHECKED_IN' ? '已入住' : '预订中'} ${o.plannedCheckIn.slice(5, 10)}~${o.plannedCheckOut.slice(5, 10)}）`,
    value: o.id,
  })),
)
async function onCustomerChange(customerId: string | null) {
  model.value.occupancyId = null
  // 过敏源默认取客户资料里填的，可在这里改
  model.value.allergens = customers.value.find((c) => c.id === customerId)?.allergens ?? ''
  customerOccupancies.value = customerId
    ? await roomOccupancyApi.list({ customerId, status: undefined }).then((list) => list.filter((o) => o.status === 'RESERVED' || o.status === 'CHECKED_IN'))
    : []
}

const auth = useAuthStore()
// 在用 / 已归档（有护理记录的档案不能删，只能归档；归档的默认不显示，可恢复）
const view = ref<'active' | 'archived'>('active')
const removal = ref<{ id: string; label: string } | null>(null)
const removalShow = ref(false)
function openRemoval(row: MotherProfile) {
  removal.value = { id: row.id, label: nameOf(row) }
  removalShow.value = true
}

async function fetchAll() {
  loading.value = true
  try {
    const [profiles, customerList, tagList] = await Promise.all([motherProfileApi.list(view.value === 'archived' ? { archived: 'only' } : undefined), customerApi.list(), tagApi.list()])
    rows.value = profiles
    customers.value = customerList
    tags.value = tagList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = {
    customerId: null,
    occupancyId: null,
    deliveryMethod: 'UNKNOWN',
    deliveryDate: null,
    gestationalWeeks: null,
    expectedDeliveryDate: null,
    careNote: '',
    allergens: '',
    remark: '',
    riskTagIds: [],
    babies: [],
  }
  customerOccupancies.value = []
  formVisible.value = true
}

function createBabyRow() {
  return { key: babyRowKey++, name: '', gender: 'UNKNOWN' as const }
}

async function handleSubmit() {
  if (!model.value.customerId) {
    message.error('请选择客户')
    return
  }
  submitting.value = true
  try {
    const created = await motherProfileApi.create({
      customerId: model.value.customerId,
      occupancyId: model.value.occupancyId ?? undefined,
      deliveryMethod: model.value.deliveryMethod,
      deliveryDate: model.value.deliveryDate ? new Date(model.value.deliveryDate).toISOString() : undefined,
      gestationalWeeks: model.value.gestationalWeeks ?? undefined,
      expectedDeliveryDate: model.value.expectedDeliveryDate ? new Date(model.value.expectedDeliveryDate).toISOString() : undefined,
      careNote: model.value.careNote || undefined,
      allergens: model.value.allergens,
      remark: model.value.remark || undefined,
      riskTagIds: model.value.riskTagIds,
      babies: model.value.babies.map(({ key: _key, ...b }) => b),
    })
    message.success('产妇档案已建立')
    formVisible.value = false
    router.push(`/care/profiles/${created.id}`)
  } finally {
    submitting.value = false
  }
}

const roomNoOf = (row: MotherProfile) => row.occupancy?.room?.roomNo ?? ''
const nameOf = (row: MotherProfile) => row.customer?.name ?? customerNameById.value.get(row.customerId) ?? row.customerId
const md = (iso: string | null) => (iso ? `${new Date(iso).getMonth() + 1}/${new Date(iso).getDate()}` : '')

/** 宝宝一行：宝宝1：名字（男）· 3750g · 8/20 出生 —— 不用点进去就能认出是哪家的宝宝 */
function babyLine(b: MotherProfile['babies'][number]): string {
  const parts = [`宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}（${BABY_GENDER_LABEL_MAP[b.gender] ?? b.gender}）`]
  if (b.birthWeightGrams) parts.push(`${b.birthWeightGrams}g`)
  if (b.birthDate) parts.push(`${md(b.birthDate)} 出生`)
  return parts.join(' · ')
}

/** 按房号、客户名、手机、宝宝名搜索 */
const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return rows.value
  return rows.value.filter((r) =>
    [roomNoOf(r), nameOf(r), r.customer?.phone ?? '', ...r.babies.map((b) => b.name ?? '')].some((t) => t.toLowerCase().includes(k)),
  )
})

const roomBadge = (row: MotherProfile) =>
  roomNoOf(row) ? h('span', { class: 'cp-room' }, roomNoOf(row)) : h('span', { class: 'cp-room cp-room-none' }, '未排房')

const columns: DataTableColumns<MotherProfile> = [
  { key: 'room', title: '房号', width: 90, render: roomBadge },
  {
    key: 'customer',
    title: '客户 / 宝宝',
    minWidth: 220,
    render: (row) =>
      h('div', null, [
        h('div', { class: 'cp-name' }, nameOf(row)),
        ...(row.babies.length > 0 ? row.babies.map((b) => h('div', { class: 'cp-baby' }, '👶 ' + babyLine(b))) : [h('div', { class: 'cp-baby cp-baby-none' }, '尚未登记宝宝')]),
      ]),
  },
  { key: 'deliveryMethod', title: '分娩方式', width: 100, render: (row) => DELIVERY_METHOD_LABEL_MAP[row.deliveryMethod] },
  { key: 'gestationalWeeks', title: '孕周', width: 80, render: (row) => (row.gestationalWeeks ? `${row.gestationalWeeks} 周` : '-') },
  { key: 'createdAt', title: '建档时间', width: 160, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) },
  {
    key: 'actions',
    title: '操作',
    width: 190,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', type: 'primary', onClick: () => router.push(`/care/profiles/${row.id}`) }, { default: () => '打开档案' }),
          ...(auth.hasAccess('care.profile.update')
            ? [h(NButton, { size: 'small', type: row.archivedAt ? 'primary' : 'warning', ghost: true, onClick: () => openRemoval(row) }, { default: () => (row.archivedAt ? '恢复/删除' : '归档/删除') })]
            : []),
        ],
      }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="space-between" :wrap="true" style="margin-bottom: 12px">
      <n-space>
        <n-input v-model:value="keyword" clearable placeholder="按房号 / 客户 / 手机 / 宝宝名搜索" style="width: min(320px, 94vw)" />
        <n-radio-group v-model:value="view" @update:value="fetchAll">
          <n-radio-button value="active">在用</n-radio-button>
          <n-radio-button value="archived">已归档</n-radio-button>
        </n-radio-group>
      </n-space>
      <n-button type="primary" @click="openCreateModal">建立产妇档案</n-button>
    </n-space>

    <!-- 手机：卡片列表（房号醒目 + 客户 + 宝宝信息），整张卡片点开档案 -->
    <div v-if="isMobile" class="cp-cards">
      <div v-for="r in filtered" :key="r.id" class="cp-card" @click="router.push(`/care/profiles/${r.id}`)">
        <div class="cp-card-top">
          <component :is="() => roomBadge(r)" />
          <span class="cp-name">{{ nameOf(r) }}</span>
          <span class="cp-meta">{{ DELIVERY_METHOD_LABEL_MAP[r.deliveryMethod] }}{{ r.gestationalWeeks ? ' · ' + r.gestationalWeeks + '周' : '' }}</span>
        </div>
        <div v-for="b in r.babies" :key="b.id" class="cp-baby">👶 {{ babyLine(b) }}</div>
        <div v-if="r.babies.length === 0" class="cp-baby cp-baby-none">尚未登记宝宝</div>
        <div v-if="auth.hasAccess('care.profile.update')" style="margin-top: 6px" @click.stop>
          <n-button size="tiny" :type="r.archivedAt ? 'primary' : 'warning'" ghost @click="openRemoval(r)">{{ r.archivedAt ? '恢复/删除' : '归档/删除' }}</n-button>
        </div>
      </div>
      <n-empty v-if="!loading && filtered.length === 0" description="没有找到对应的母婴档案" />
    </div>
    <n-data-table v-else :columns="columns" :data="filtered" :loading="loading" :row-key="(r: MotherProfile) => r.id" :scroll-x="860" />

    <record-removal-dialog v-if="removal" v-model:show="removalShow" kind="mother" :id="removal.id" :label="removal.label" @done="fetchAll" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="建立产妇档案" style="width: min(640px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="客户">
            <n-select v-model:value="model.customerId" :options="customerOptions" filterable placeholder="搜索客户姓名/手机号" @update:value="onCustomerChange" />
          </n-form-item>
          <n-form-item label="关联入住">
            <n-select
              v-model:value="model.occupancyId"
              :options="occupancyOptions"
              clearable
              :disabled="!model.customerId"
              :placeholder="model.customerId ? '不关联也可以，之后排房了再补' : '先选客户'"
            />
          </n-form-item>
          <n-form-item label="分娩方式">
            <n-select
              v-model:value="model.deliveryMethod"
              :options="[
                { label: '顺产', value: 'VAGINAL' },
                { label: '剖宫产', value: 'CESAREAN' },
                { label: '未知', value: 'UNKNOWN' },
              ]"
            />
          </n-form-item>
          <n-form-item label="分娩日期"><n-date-picker v-model:value="model.deliveryDate" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="孕周"><n-input-number v-model:value="model.gestationalWeeks" :min="1" :max="45" style="width: 100%" /></n-form-item>
          <n-form-item label="预产期"><n-date-picker v-model:value="model.expectedDeliveryDate" type="date" style="width: 100%" clearable /></n-form-item>
          <n-form-item label="风险标签"><n-select v-model:value="model.riskTagIds" multiple :options="tagOptions" placeholder="早产/传染病/高敏等" /></n-form-item>
          <n-form-item label="过敏源"><n-input v-model:value="model.allergens" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" placeholder="如：青霉素、海鲜；没有请填“无”" /></n-form-item>
          <n-form-item label="医嘱"><n-input v-model:value="model.careNote" placeholder="护理看板卡片上显示的简短提示" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
          <n-form-item label="宝宝">
            <n-dynamic-input v-model:value="model.babies" :on-create="createBabyRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-input v-model:value="value.name" placeholder="宝宝姓名/编号" style="width: min(200px, 94vw)" />
                <n-select
                  v-model:value="value.gender"
                  style="width: min(120px, 94vw)"
                  :options="[
                    { label: '男', value: 'MALE' },
                    { label: '女', value: 'FEMALE' },
                    { label: '未知', value: 'UNKNOWN' },
                  ]"
                />
                <n-input v-model:value="value.allergens" placeholder="宝宝过敏源（没有可不填）" style="width: min(220px, 94vw)" />
              </n-space>
            </n-dynamic-input>
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style>
.cp-room {
  display: inline-block;
  min-width: 52px;
  padding: 2px 8px;
  border-radius: 6px;
  background: #2a64b0;
  color: #fff;
  font-weight: 700;
  text-align: center;
  font-size: 14px;
}
.cp-room-none {
  background: #bbb;
  font-weight: 400;
  font-size: 12px;
}
.cp-name {
  font-weight: 600;
  font-size: 15px;
}
.cp-baby {
  margin-top: 3px;
  color: #555;
  font-size: 12.5px;
  line-height: 1.5;
}
.cp-baby-none {
  color: #aaa;
}
.cp-meta {
  margin-left: auto;
  color: #888;
  font-size: 12px;
}
.cp-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cp-card {
  padding: 10px 12px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.cp-card:active {
  background: #f5f8fc;
}
.cp-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
