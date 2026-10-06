<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDynamicInput, type DataTableColumns, type FormInst } from 'naive-ui'
import { mealItemApi, mealPlanTemplateApi } from '../../api/modules/meal.api'
import type { MealItem, MealPlanTemplate, MealPlanTemplateItemInput, MealPlanType, MealSlot } from '../../api/types/meal'
import { renderStatusBadge, COMMON_STATUS_MAP, MEAL_PLAN_TYPE_LABEL_MAP, MEAL_SLOT_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const PLAN_TYPE_OPTIONS = Object.entries(MEAL_PLAN_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))
const SLOT_OPTIONS = Object.entries(MEAL_SLOT_LABEL_MAP).map(([value, label]) => ({ label, value }))

const rows = ref<MealPlanTemplate[]>([])
const allMealItems = ref<MealItem[]>([])
const mealItemOptions = ref<{ label: string; value: string }[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<MealPlanTemplate | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  planType: 'MONTH_MEAL' as MealPlanType,
  totalDays: 28,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  phases: [] as { key: number; name: string; days: number }[],
  items: [] as (MealPlanTemplateItemInput & { key: number })[],
})

let rowKey = 0

async function fetchAll() {
  loading.value = true
  try {
    const [plans, items] = await Promise.all([mealPlanTemplateApi.list(), mealItemApi.list()])
    rows.value = plans
    allMealItems.value = items
    mealItemOptions.value = items.map((i) => ({ label: i.name, value: i.id }))
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', planType: 'MONTH_MEAL', totalDays: 28, status: 'ACTIVE', phases: [], items: [] }
  formVisible.value = true
}

function openEditModal(row: MealPlanTemplate) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    planType: row.planType,
    totalDays: row.totalDays,
    status: row.status,
    phases: (row.phases ?? []).map((p) => ({ key: rowKey++, name: p.name, days: p.days })),
    items: row.items
      .slice()
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((i) => ({ key: rowKey++, dayOffset: i.dayOffset, slot: i.slot, mealItemId: i.mealItemId })),
  }
  formVisible.value = true
}

function createPhaseRow() {
  return { key: rowKey++, name: '', days: 7 }
}

function createItemRow() {
  return { key: rowKey++, dayOffset: 1, slot: 'LUNCH' as MealSlot, mealItemId: '' }
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (model.value.items.length === 0 || model.value.items.some((i) => !i.mealItemId)) {
    message.error('请至少排一餐，且每行都要选择菜品')
    return
  }
  submitting.value = true
  try {
    const itemsPayload: MealPlanTemplateItemInput[] = model.value.items.map((i) => ({ dayOffset: i.dayOffset, slot: i.slot, mealItemId: i.mealItemId }))
    const phasesPayload = model.value.phases.map((p) => ({ name: p.name, days: p.days }))
    if (editingRow.value) {
      await mealPlanTemplateApi.update(editingRow.value.id, {
        name: model.value.name,
        status: model.value.status,
        items: itemsPayload,
        version: editingRow.value.version,
      })
      message.success('膳食计划已更新')
    } else {
      await mealPlanTemplateApi.create({
        code: model.value.code,
        name: model.value.name,
        planType: model.value.planType,
        totalDays: model.value.totalDays,
        phases: phasesPayload,
        items: itemsPayload,
      })
      message.success('膳食计划已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<MealPlanTemplate> = [
  { key: 'name', title: '膳食计划名称' },
  { key: 'code', title: '编码' },
  { key: 'planType', title: '计划类型', render: (row) => MEAL_PLAN_TYPE_LABEL_MAP[row.planType] },
  { key: 'totalDays', title: '总天数', render: (row) => `${row.totalDays} 天` },
  { key: 'items', title: '排餐项数', render: (row) => `${row.items.length} 项` },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建膳食计划</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: MealPlanTemplate) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑膳食计划' : '新建膳食计划'" style="width: min(680px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 month_meal_28d" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 月子餐标准方案28天" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="计划类型">
            <n-select v-model:value="model.planType" :options="PLAN_TYPE_OPTIONS" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="总天数">
            <n-input-number v-model:value="model.totalDays" :min="1" style="width: 100%" />
          </n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '启用', value: 'ACTIVE' },
                { label: '停用', value: 'INACTIVE' },
              ]"
            />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="阶段划分">
            <n-dynamic-input v-model:value="model.phases" :on-create="createPhaseRow" #="{ value }">
              <n-space :wrap="false" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-input v-model:value="value.name" placeholder="阶段名称，如 第1阶段" style="width: min(220px, 94vw)" />
                <n-input-number v-model:value="value.days" :min="1" placeholder="天数" style="width: min(120px, 94vw)" />
              </n-space>
            </n-dynamic-input>
          </n-form-item>
          <n-form-item label="每日排餐">
            <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-input-number v-model:value="value.dayOffset" :min="1" :max="model.totalDays" placeholder="第几天" style="width: min(100px, 94vw)" />
                <n-select v-model:value="value.slot" :options="SLOT_OPTIONS" style="width: min(110px, 94vw)" />
                <n-select v-model:value="value.mealItemId" :options="mealItemOptions" filterable placeholder="选择菜品" style="width: min(220px, 94vw)" />
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
