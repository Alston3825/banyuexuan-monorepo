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
  NSelect,
  NDynamicInput,
  NCheckbox,
  NTag,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { careFieldApi, careFormTemplateApi } from '../../api/modules/care.api'
import type { CareFieldDefinition, CareFormDepartment, CareFormScene, CareFormTemplate, CareFormTemplateFieldInput, CareTargetType } from '../../api/types/care'
import {
  renderStatusBadge,
  COMMON_STATUS_MAP,
  CARE_TARGET_TYPE_LABEL_MAP,
  CARE_FORM_DEPARTMENT_LABEL_MAP,
  CARE_FORM_SCENE_LABEL_MAP,
} from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<CareFormTemplate[]>([])
const allFields = ref<CareFieldDefinition[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<CareFormTemplate | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  targetType: 'MOTHER' as CareTargetType,
  department: 'NURSING' as CareFormDepartment,
  scene: 'GENERAL' as CareFormScene,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  fields: [] as (CareFormTemplateFieldInput & { key: number })[],
})

let fieldRowKey = 0

const departmentOptions = Object.entries(CARE_FORM_DEPARTMENT_LABEL_MAP).map(([value, label]) => ({ label, value }))
const sceneOptions = Object.entries(CARE_FORM_SCENE_LABEL_MAP).map(([value, label]) => ({ label, value }))

const availableFieldOptions = computed(() =>
  allFields.value.filter((f) => f.targetType === model.value.targetType).map((f) => ({ label: `${f.name}（${f.code}）`, value: f.id })),
)

async function fetchAll() {
  loading.value = true
  try {
    const [templates, fields] = await Promise.all([careFormTemplateApi.list(), careFieldApi.list()])
    rows.value = templates
    allFields.value = fields
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', targetType: 'MOTHER', department: 'NURSING', scene: 'GENERAL', status: 'ACTIVE', fields: [] }
  formVisible.value = true
}

function openEditModal(row: CareFormTemplate) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    targetType: row.targetType,
    department: row.department,
    scene: row.scene,
    status: row.status,
    fields: row.fields
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ key: fieldRowKey++, fieldId: f.fieldId, required: f.required, sortOrder: f.sortOrder })),
  }
  formVisible.value = true
}

function createFieldRow() {
  return { key: fieldRowKey++, fieldId: '', required: false, sortOrder: model.value.fields.length }
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (model.value.fields.length === 0 || model.value.fields.some((f) => !f.fieldId)) {
    message.error('请至少选择一个护理字段，且每行都要选择字段')
    return
  }
  submitting.value = true
  try {
    const fieldsPayload: CareFormTemplateFieldInput[] = model.value.fields.map((f, idx) => ({
      fieldId: f.fieldId,
      required: f.required,
      sortOrder: idx,
    }))
    if (editingRow.value) {
      await careFormTemplateApi.update(editingRow.value.id, {
        name: model.value.name,
        scene: model.value.scene,
        status: model.value.status,
        fields: fieldsPayload,
        version: editingRow.value.version,
      })
      message.success('护理项目已更新')
    } else {
      await careFormTemplateApi.create({
        code: model.value.code,
        name: model.value.name,
        targetType: model.value.targetType,
        department: model.value.department,
        scene: model.value.scene,
        fields: fieldsPayload,
      })
      message.success('护理项目已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<CareFormTemplate> = [
  { key: 'name', title: '护理项目名称' },
  { key: 'code', title: '编码' },
  { key: 'targetType', title: '适用对象', render: (row) => CARE_TARGET_TYPE_LABEL_MAP[row.targetType] },
  { key: 'department', title: '部门', render: (row) => CARE_FORM_DEPARTMENT_LABEL_MAP[row.department] },
  { key: 'scene', title: '场景', render: (row) => CARE_FORM_SCENE_LABEL_MAP[row.scene] },
  {
    key: 'fields',
    title: '包含字段',
    render: (row) => h(NSpace, { size: 4 }, { default: () => row.fields.map((f) => h(NTag, { size: 'small', key: f.id }, { default: () => f.field.name })) }),
  },
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
      <n-button type="primary" @click="openCreateModal">新建护理项目</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: CareFormTemplate) => r.id" :scroll-x="1000" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑护理项目' : '新建护理项目'" style="width: min(640px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 mother_daily_general" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="适用对象">
            <n-select
              v-model:value="model.targetType"
              :options="[
                { label: '妈妈', value: 'MOTHER' },
                { label: '宝宝', value: 'BABY' },
              ]"
              @update:value="model.fields = []"
            />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="所属部门">
            <n-select v-model:value="model.department" :options="departmentOptions" />
          </n-form-item>
          <n-form-item label="使用场景">
            <n-select v-model:value="model.scene" :options="sceneOptions" />
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
          <n-form-item label="包含字段">
            <n-dynamic-input v-model:value="model.fields" :on-create="createFieldRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-select
                  v-model:value="value.fieldId"
                  :options="availableFieldOptions"
                  filterable
                  placeholder="选择护理字段"
                  style="width: min(260px, 94vw)"
                />
                <n-checkbox v-model:checked="value.required">必填</n-checkbox>
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
