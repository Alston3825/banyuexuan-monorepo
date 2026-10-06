<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
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
  NDynamicInput,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { careFormTemplateApi, carePlanTemplateApi } from '../../api/modules/care.api'
import type { CareFormTemplate, CarePlanTemplate, CarePlanTemplateItemInput, CareTargetType } from '../../api/types/care'
import { renderStatusBadge, COMMON_STATUS_MAP, CARE_TARGET_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<CarePlanTemplate[]>([])
const allFormTemplates = ref<CareFormTemplate[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<CarePlanTemplate | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  targetType: 'MOTHER' as CareTargetType,
  totalDays: 28,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  items: [] as (CarePlanTemplateItemInput & { key: number })[],
})

let itemRowKey = 0

const availableFormTemplateOptions = computed(() =>
  allFormTemplates.value.filter((t) => t.targetType === model.value.targetType).map((t) => ({ label: t.name, value: t.id })),
)

async function fetchAll() {
  loading.value = true
  try {
    const [plans, templates] = await Promise.all([carePlanTemplateApi.list(), careFormTemplateApi.list()])
    rows.value = plans
    allFormTemplates.value = templates
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', targetType: 'MOTHER', totalDays: 28, status: 'ACTIVE', items: [] }
  formVisible.value = true
}

function openEditModal(row: CarePlanTemplate) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    targetType: row.targetType,
    totalDays: row.totalDays,
    status: row.status,
    items: row.items
      .slice()
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((i) => ({ key: itemRowKey++, dayOffset: i.dayOffset, formTemplateId: i.formTemplateId })),
  }
  formVisible.value = true
}

function createItemRow() {
  return { key: itemRowKey++, dayOffset: 1, formTemplateId: '' }
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (model.value.items.length === 0 || model.value.items.some((i) => !i.formTemplateId)) {
    message.error('请至少排一天的护理项目，且每行都要选择护理项目')
    return
  }
  submitting.value = true
  try {
    const itemsPayload: CarePlanTemplateItemInput[] = model.value.items.map((i) => ({
      dayOffset: i.dayOffset,
      formTemplateId: i.formTemplateId,
    }))
    if (editingRow.value) {
      await carePlanTemplateApi.update(editingRow.value.id, {
        name: model.value.name,
        status: model.value.status,
        items: itemsPayload,
        version: editingRow.value.version,
      })
      message.success('护理方案已更新')
    } else {
      await carePlanTemplateApi.create({
        code: model.value.code,
        name: model.value.name,
        targetType: model.value.targetType,
        totalDays: model.value.totalDays,
        items: itemsPayload,
      })
      message.success('护理方案已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<CarePlanTemplate> = [
  { key: 'name', title: '护理方案名称' },
  { key: 'code', title: '编码' },
  { key: 'targetType', title: '适用对象', render: (row) => CARE_TARGET_TYPE_LABEL_MAP[row.targetType] },
  { key: 'totalDays', title: '总天数', render: (row) => `${row.totalDays} 天` },
  { key: 'items', title: '排期项数', render: (row) => `${row.items.length} 项` },
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
      <n-button type="primary" @click="openCreateModal">新建护理方案</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: CarePlanTemplate) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑护理方案' : '新建护理方案'" style="width: min(640px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 mother_28d" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 妈妈护理入住方案28天" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="适用对象">
            <n-select
              v-model:value="model.targetType"
              :options="[
                { label: '妈妈', value: 'MOTHER' },
                { label: '宝宝', value: 'BABY' },
              ]"
              @update:value="model.items = []"
            />
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
          <n-form-item label="每日排期">
            <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-input-number v-model:value="value.dayOffset" :min="1" :max="model.totalDays" placeholder="第几天" style="width: min(120px, 94vw)" />
                <n-select
                  v-model:value="value.formTemplateId"
                  :options="availableFormTemplateOptions"
                  filterable
                  placeholder="选择护理项目"
                  style="width: min(260px, 94vw)"
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
