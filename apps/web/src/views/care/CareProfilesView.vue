<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
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
  type DataTableColumns,
} from 'naive-ui'
import { motherProfileApi } from '../../api/modules/care.api'
import { customerApi } from '../../api/modules/customer.api'
import { tagApi } from '../../api/modules/tag.api'
import type { BabyProfileInput, DeliveryMethod, MotherProfile } from '../../api/types/care'
import type { Customer } from '../../api/types/customer'
import type { Tag } from '../../api/types/tag'
import { DELIVERY_METHOD_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<MotherProfile[]>([])
const customers = ref<Customer[]>([])
const tags = ref<Tag[]>([])
const loading = ref(false)

const customerNameById = computed(() => new Map(customers.value.map((c) => [c.id, c.name])))
const customerOptions = computed(() => customers.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })))
const tagOptions = computed(() => tags.value.map((t) => ({ label: t.name, value: t.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  customerId: null as string | null,
  deliveryMethod: 'UNKNOWN' as DeliveryMethod,
  deliveryDate: null as number | null,
  gestationalWeeks: null as number | null,
  expectedDeliveryDate: null as number | null,
  remark: '',
  riskTagIds: [] as string[],
  babies: [] as (BabyProfileInput & { key: number })[],
})
let babyRowKey = 0

async function fetchAll() {
  loading.value = true
  try {
    const [profiles, customerList, tagList] = await Promise.all([motherProfileApi.list(), customerApi.list(), tagApi.list()])
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
    deliveryMethod: 'UNKNOWN',
    deliveryDate: null,
    gestationalWeeks: null,
    expectedDeliveryDate: null,
    remark: '',
    riskTagIds: [],
    babies: [],
  }
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
      deliveryMethod: model.value.deliveryMethod,
      deliveryDate: model.value.deliveryDate ? new Date(model.value.deliveryDate).toISOString() : undefined,
      gestationalWeeks: model.value.gestationalWeeks ?? undefined,
      expectedDeliveryDate: model.value.expectedDeliveryDate ? new Date(model.value.expectedDeliveryDate).toISOString() : undefined,
      remark: model.value.remark || undefined,
      riskTagIds: model.value.riskTagIds,
      babies: model.value.babies.map(({ key: _key, ...b }) => b),
    })
    message.success('妈妈档案已建立')
    formVisible.value = false
    router.push(`/care/profiles/${created.id}`)
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<MotherProfile> = [
  { key: 'customer', title: '客户', render: (row) => customerNameById.value.get(row.customerId) ?? row.customerId },
  { key: 'deliveryMethod', title: '分娩方式', render: (row) => DELIVERY_METHOD_LABEL_MAP[row.deliveryMethod] },
  { key: 'gestationalWeeks', title: '孕周', render: (row) => (row.gestationalWeeks ? `${row.gestationalWeeks} 周` : '-') },
  { key: 'babies', title: '宝宝数', render: (row) => `${row.babies.length} 个` },
  { key: 'createdAt', title: '建档时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/care/profiles/${row.id}`) }, { default: () => '查看' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">建立母婴档案</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: MotherProfile) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="建立母婴档案" style="width: 640px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="客户">
            <n-select v-model:value="model.customerId" :options="customerOptions" filterable placeholder="搜索客户姓名/手机号" />
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
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
          <n-form-item label="宝宝">
            <n-dynamic-input v-model:value="model.babies" :on-create="createBabyRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%">
                <n-input v-model:value="value.name" placeholder="宝宝姓名/编号" style="width: 200px" />
                <n-select
                  v-model:value="value.gender"
                  style="width: 120px"
                  :options="[
                    { label: '男', value: 'MALE' },
                    { label: '女', value: 'FEMALE' },
                    { label: '未知', value: 'UNKNOWN' },
                  ]"
                />
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
