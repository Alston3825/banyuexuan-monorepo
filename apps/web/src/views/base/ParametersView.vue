<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
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
  NSwitch,
  NSelect,
  type DataTableColumns,
} from 'naive-ui'
import { parameterApi } from '../../api/modules/parameter.api'
import { storeApi } from '../../api/modules/store.api'
import type { Parameter, ParameterValueType } from '../../api/types/parameter'
import { message, dialog } from '../../utils/discrete-api'

const GLOBAL_SCOPE = '__GLOBAL__'

const rows = ref<Parameter[]>([])
const loading = ref(false)
const storeOptions = ref<{ label: string; value: string }[]>([{ label: '全局 / 租户级默认', value: GLOBAL_SCOPE }])
const storeNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await parameterApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchStoreOptions() {
  const stores = await storeApi.list()
  storeOptions.value = [{ label: '全局 / 租户级默认', value: GLOBAL_SCOPE }, ...stores.map((s) => ({ label: s.name, value: s.id }))]
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
}

const formVisible = ref(false)
const editingRow = ref<Parameter | null>(null)
const submitting = ref(false)
const model = ref({
  key: '',
  storeScope: GLOBAL_SCOPE,
  valueType: 'STRING' as ParameterValueType,
  description: '',
  stringValue: '',
  numberValue: 0,
  boolValue: false,
  jsonValue: '',
})

function openCreateModal() {
  editingRow.value = null
  model.value = {
    key: '',
    storeScope: GLOBAL_SCOPE,
    valueType: 'STRING',
    description: '',
    stringValue: '',
    numberValue: 0,
    boolValue: false,
    jsonValue: '',
  }
  formVisible.value = true
}

function openEditModal(row: Parameter) {
  editingRow.value = row
  model.value = {
    key: row.key,
    storeScope: row.storeId ?? GLOBAL_SCOPE,
    valueType: row.valueType,
    description: row.description ?? '',
    stringValue: row.valueType === 'STRING' ? row.value : '',
    numberValue: row.valueType === 'NUMBER' ? Number(row.value) : 0,
    boolValue: row.valueType === 'BOOLEAN' ? row.value === 'true' : false,
    jsonValue: row.valueType === 'JSON' ? row.value : '',
  }
  formVisible.value = true
}

function currentValueString(): string {
  switch (model.value.valueType) {
    case 'NUMBER':
      return String(model.value.numberValue)
    case 'BOOLEAN':
      return String(model.value.boolValue)
    case 'JSON':
      return model.value.jsonValue
    default:
      return model.value.stringValue
  }
}

async function handleSubmit() {
  if (model.value.valueType === 'JSON') {
    try {
      JSON.parse(model.value.jsonValue)
    } catch {
      message.error('JSON 格式不正确')
      return
    }
  }
  submitting.value = true
  try {
    if (editingRow.value) {
      await parameterApi.update(editingRow.value.id, {
        value: currentValueString(),
        description: model.value.description,
        version: editingRow.value.version,
      })
      message.success('参数已更新')
    } else {
      await parameterApi.create({
        key: model.value.key,
        value: currentValueString(),
        valueType: model.value.valueType,
        description: model.value.description,
        storeId: model.value.storeScope === GLOBAL_SCOPE ? undefined : model.value.storeScope,
      })
      message.success('参数已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

function confirmDelete(row: Parameter) {
  dialog.warning({
    title: '删除参数',
    content: `确认删除「${row.key}」吗？此操作不可撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await parameterApi.remove(row.id)
      message.success('参数已删除')
      await fetchList()
    },
  })
}

const columns: DataTableColumns<Parameter> = [
  { key: 'key', title: 'Key' },
  { key: 'value', title: '值' },
  { key: 'valueType', title: '类型' },
  { key: 'storeId', title: '范围', render: (row) => (row.storeId ? storeNameById.value[row.storeId] ?? row.storeId : '全局/租户级默认') },
  { key: 'description', title: '说明', render: (row) => row.description ?? '-' },
  {
    key: 'actions',
    title: '操作',
    width: 160,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          h(
            NButton,
            { size: 'small', type: 'error', quaternary: true, disabled: row.isSystem, onClick: () => confirmDelete(row) },
            { default: () => '删除' },
          ),
        ],
      }),
  },
]

onMounted(async () => {
  await Promise.all([fetchList(), fetchStoreOptions()])
})
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建参数</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Parameter) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑参数' : '新建参数'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="Key">
            <n-input v-model:value="model.key" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="范围">
            <n-select v-model:value="model.storeScope" :options="storeOptions" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="值类型">
            <n-select
              v-model:value="model.valueType"
              :options="[
                { label: '字符串', value: 'STRING' },
                { label: '数字', value: 'NUMBER' },
                { label: '布尔', value: 'BOOLEAN' },
                { label: 'JSON', value: 'JSON' },
              ]"
            />
          </n-form-item>
          <n-form-item label="值">
            <n-input v-if="model.valueType === 'STRING'" v-model:value="model.stringValue" />
            <n-input-number v-else-if="model.valueType === 'NUMBER'" v-model:value="model.numberValue" style="width: 100%" />
            <n-switch v-else-if="model.valueType === 'BOOLEAN'" v-model:value="model.boolValue" />
            <n-input v-else v-model:value="model.jsonValue" type="textarea" placeholder="合法 JSON 文本" />
          </n-form-item>
          <n-form-item label="说明">
            <n-input v-model:value="model.description" />
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
