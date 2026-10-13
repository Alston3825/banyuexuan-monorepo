<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { serviceProductApi } from '../../api/modules/service.api'
import type { ServiceProduct } from '../../api/types/service'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<ServiceProduct[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<ServiceProduct | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  durationMinutes: null as number | null,
  unitPrice: null as number | null,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await serviceProductApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', durationMinutes: null, unitPrice: null, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: ServiceProduct) {
  editingRow.value = row
  model.value = { code: row.code, name: row.name, durationMinutes: row.durationMinutes, unitPrice: row.unitPrice, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await serviceProductApi.update(editingRow.value.id, {
        name: model.value.name,
        durationMinutes: model.value.durationMinutes ?? undefined,
        unitPrice: model.value.unitPrice ?? undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('产康项目已更新')
    } else {
      await serviceProductApi.create({
        code: model.value.code,
        name: model.value.name,
        durationMinutes: model.value.durationMinutes ?? undefined,
        unitPrice: model.value.unitPrice ?? undefined,
      })
      message.success('产康项目已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<ServiceProduct> = [
  { key: 'name', title: '项目名称' },
  { key: 'code', title: '编码' },
  { key: 'durationMinutes', title: '时长(分钟)', render: (row) => row.durationMinutes ?? '-' },
  { key: 'unitPrice', title: '散卖价(分)', render: (row) => row.unitPrice ?? '-' },
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
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建产康项目</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ServiceProduct) => r.id" :scroll-x="700" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑产康项目' : '新建产康项目'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 back_treatment" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 产后开背" />
          </n-form-item>
          <n-form-item label="时长(分钟)"><n-input-number v-model:value="model.durationMinutes" :min="1" style="width: 100%" /></n-form-item>
          <n-form-item label="散卖价(分)"><n-input-number v-model:value="model.unitPrice" :min="0" style="width: 100%" placeholder="仅按套餐消耗的项目可留空" /></n-form-item>
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
