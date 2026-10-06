<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { dietaryRestrictionApi, dinerProfileApi, mealPlanTemplateApi } from '../../api/modules/meal.api'
import { customerApi } from '../../api/modules/customer.api'
import type { DietaryRestriction, DinerProfile, MealPlanTemplate } from '../../api/types/meal'
import type { Customer } from '../../api/types/customer'
import { renderStatusBadge, DINER_PROFILE_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<DinerProfile[]>([])
const customers = ref<Customer[]>([])
const templates = ref<MealPlanTemplate[]>([])
const restrictions = ref<DietaryRestriction[]>([])
const loading = ref(false)

const customerNameById = computed(() => new Map(customers.value.map((c) => [c.id, c.name])))
const customerOptions = computed(() => customers.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })))
const templateOptions = computed(() => templates.value.map((t) => ({ label: `${t.name}（${t.totalDays}天）`, value: t.id })))
const templateNameById = computed(() => new Map(templates.value.map((t) => [t.id, t.name])))
const restrictionOptions = computed(() => restrictions.value.map((r) => ({ label: r.name, value: r.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  customerId: null as string | null,
  mealPlanTemplateId: null as string | null,
  startDate: null as number | null,
  restrictionIds: [] as string[],
})

async function fetchAll() {
  loading.value = true
  try {
    const [profiles, customerList, templateList, restrictionList] = await Promise.all([
      dinerProfileApi.list(),
      customerApi.list(),
      mealPlanTemplateApi.list(),
      dietaryRestrictionApi.list(),
    ])
    rows.value = profiles
    customers.value = customerList
    templates.value = templateList
    restrictions.value = restrictionList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { customerId: null, mealPlanTemplateId: null, startDate: Date.now(), restrictionIds: [] }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.customerId || !model.value.mealPlanTemplateId || !model.value.startDate) {
    message.error('请选择客户、膳食计划与开始日期')
    return
  }
  submitting.value = true
  try {
    const created = await dinerProfileApi.create({
      customerId: model.value.customerId,
      mealPlanTemplateId: model.value.mealPlanTemplateId,
      startDate: new Date(model.value.startDate).toISOString().slice(0, 10),
      restrictionIds: model.value.restrictionIds,
    })
    message.success('用膳人已建立，已自动生成排餐记录')
    formVisible.value = false
    router.push(`/meal/diner-profiles/${created.id}`)
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<DinerProfile> = [
  { key: 'customer', title: '客户', render: (row) => customerNameById.value.get(row.customerId) ?? row.customerId },
  { key: 'template', title: '膳食计划', render: (row) => templateNameById.value.get(row.mealPlanTemplateId) ?? row.mealPlanTemplateId },
  { key: 'startDate', title: '开始日期', render: (row) => new Date(row.startDate).toLocaleDateString() },
  { key: 'endDate', title: '结束日期', render: (row) => new Date(row.endDate).toLocaleDateString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, DINER_PROFILE_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/meal/diner-profiles/${row.id}`) }, { default: () => '查看' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">建立用膳人</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: DinerProfile) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="建立用膳人" style="width: min(520px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="客户">
            <n-select v-model:value="model.customerId" :options="customerOptions" filterable placeholder="搜索客户姓名/手机号" />
          </n-form-item>
          <n-form-item label="膳食计划">
            <n-select v-model:value="model.mealPlanTemplateId" :options="templateOptions" placeholder="选择膳食计划模板" />
          </n-form-item>
          <n-form-item label="开始日期"><n-date-picker v-model:value="model.startDate" type="date" style="width: 100%" /></n-form-item>
          <n-form-item label="饮食禁忌">
            <n-select v-model:value="model.restrictionIds" multiple :options="restrictionOptions" placeholder="不选=无禁忌" />
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
