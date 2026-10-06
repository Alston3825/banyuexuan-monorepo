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
  NSwitch,
  NDynamicInput,
  NRadioGroup,
  NRadioButton,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { careFieldApi } from '../../api/modules/care.api'
import type { CareFieldControlType, CareFieldDefinition, CareFieldOption, CareTargetType } from '../../api/types/care'
import { renderStatusBadge, COMMON_STATUS_MAP, CARE_TARGET_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const CONTROL_TYPE_LABEL_MAP: Record<CareFieldControlType, string> = {
  NUMBER: '数值',
  TEXT: '单行文本',
  TEXTAREA: '多行文本',
  SELECT: '下拉选择',
  RADIO: '单选',
}

const rows = ref<CareFieldDefinition[]>([])
const loading = ref(false)
const targetFilter = ref<CareTargetType | ''>('')

const formVisible = ref(false)
const editingRow = ref<CareFieldDefinition | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  targetType: 'MOTHER' as CareTargetType,
  controlType: 'NUMBER' as CareFieldControlType,
  unit: '',
  options: [] as CareFieldOption[],
  normalMin: null as number | null,
  normalMax: null as number | null,
  normalOptionValues: [] as string[],
  visibleToClient: false,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

const isOptionType = computed(() => model.value.controlType === 'SELECT' || model.value.controlType === 'RADIO')
const isNumberType = computed(() => model.value.controlType === 'NUMBER')
const optionSelectChoices = computed(() => model.value.options.map((o) => ({ label: `${o.label}（${o.value}）`, value: o.value })))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await careFieldApi.list(targetFilter.value || undefined)
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = {
    code: '',
    name: '',
    targetType: 'MOTHER',
    controlType: 'NUMBER',
    unit: '',
    options: [],
    normalMin: null,
    normalMax: null,
    normalOptionValues: [],
    visibleToClient: false,
    status: 'ACTIVE',
  }
  formVisible.value = true
}

function openEditModal(row: CareFieldDefinition) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    targetType: row.targetType,
    controlType: row.controlType,
    unit: row.unit ?? '',
    options: row.options ? [...row.options] : [],
    normalMin: row.normalMin,
    normalMax: row.normalMax,
    normalOptionValues: row.normalOptionValues ? [...row.normalOptionValues] : [],
    visibleToClient: row.visibleToClient,
    status: row.status,
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await careFieldApi.update(editingRow.value.id, {
        name: model.value.name,
        unit: model.value.unit || undefined,
        options: isOptionType.value ? model.value.options : undefined,
        normalMin: isNumberType.value ? (model.value.normalMin ?? undefined) : undefined,
        normalMax: isNumberType.value ? (model.value.normalMax ?? undefined) : undefined,
        normalOptionValues: isOptionType.value ? model.value.normalOptionValues : undefined,
        visibleToClient: model.value.visibleToClient,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('护理字段已更新')
    } else {
      await careFieldApi.create({
        code: model.value.code,
        name: model.value.name,
        targetType: model.value.targetType,
        controlType: model.value.controlType,
        unit: model.value.unit || undefined,
        options: isOptionType.value ? model.value.options : undefined,
        normalMin: isNumberType.value ? (model.value.normalMin ?? undefined) : undefined,
        normalMax: isNumberType.value ? (model.value.normalMax ?? undefined) : undefined,
        normalOptionValues: isOptionType.value ? model.value.normalOptionValues : undefined,
        visibleToClient: model.value.visibleToClient,
      })
      message.success('护理字段已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

function normalRangeText(row: CareFieldDefinition): string {
  if (row.controlType === 'NUMBER') {
    if (row.normalMin === null && row.normalMax === null) return '不判定'
    return `${row.normalMin ?? '-∞'} ~ ${row.normalMax ?? '+∞'}`
  }
  if (row.controlType === 'SELECT' || row.controlType === 'RADIO') {
    if (!row.normalOptionValues || row.normalOptionValues.length === 0) return '不判定'
    const labels = row.normalOptionValues.map((v) => row.options?.find((o) => o.value === v)?.label ?? v)
    return labels.join('、')
  }
  return '-'
}

const columns: DataTableColumns<CareFieldDefinition> = [
  { key: 'name', title: '字段名称' },
  { key: 'code', title: '编码' },
  { key: 'targetType', title: '适用对象', render: (row) => CARE_TARGET_TYPE_LABEL_MAP[row.targetType] },
  { key: 'controlType', title: '控件类型', render: (row) => CONTROL_TYPE_LABEL_MAP[row.controlType] },
  { key: 'unit', title: '单位', render: (row) => row.unit ?? '-' },
  { key: 'normalRange', title: '正常值域', render: (row) => normalRangeText(row) },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(fetchList)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <n-radio-group v-model:value="targetFilter" @update:value="fetchList">
        <n-radio-button value="">全部</n-radio-button>
        <n-radio-button value="MOTHER">妈妈</n-radio-button>
        <n-radio-button value="BABY">宝宝</n-radio-button>
      </n-radio-group>
      <n-button type="primary" @click="openCreateModal">新建护理字段</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: CareFieldDefinition) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑护理字段' : '新建护理字段'" style="width: min(560px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 mother_temperature" />
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
            />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="控件类型">
            <n-select
              v-model:value="model.controlType"
              :options="[
                { label: '数值', value: 'NUMBER' },
                { label: '单行文本', value: 'TEXT' },
                { label: '多行文本', value: 'TEXTAREA' },
                { label: '下拉选择', value: 'SELECT' },
                { label: '单选', value: 'RADIO' },
              ]"
            />
          </n-form-item>
          <n-form-item label="单位"><n-input v-model:value="model.unit" placeholder="如 ℃、ml（可空）" /></n-form-item>

          <n-form-item v-if="isOptionType" label="候选项">
            <n-dynamic-input
              v-model:value="model.options"
              :on-create="() => ({ value: '', label: '' })"
              #="{ value }"
            >
              <n-space :wrap="false" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-input v-model:value="value.value" placeholder="选项值 value" />
                <n-input v-model:value="value.label" placeholder="选项文案 label" />
              </n-space>
            </n-dynamic-input>
          </n-form-item>

          <n-form-item v-if="isNumberType" label="正常值下限">
            <n-input-number v-model:value="model.normalMin" style="width: 100%" placeholder="留空=不限下限" />
          </n-form-item>
          <n-form-item v-if="isNumberType" label="正常值上限">
            <n-input-number v-model:value="model.normalMax" style="width: 100%" placeholder="留空=不限上限" />
          </n-form-item>
          <n-form-item v-if="isOptionType" label="正常选项">
            <n-select v-model:value="model.normalOptionValues" multiple :options="optionSelectChoices" placeholder="不选=不参与异常判定" />
          </n-form-item>

          <n-form-item label="客户端可见">
            <n-switch v-model:value="model.visibleToClient" />
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
