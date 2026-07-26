<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { contractTemplateApi } from '../../api/modules/contract-template.api'
import type { ContractTemplate } from '../../api/types/contract-template'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<ContractTemplate[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<ContractTemplate | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({ code: '', name: '', content: '', status: 'ACTIVE' as ContractTemplate['status'] })

async function fetchList() {
  loading.value = true
  try {
    rows.value = await contractTemplateApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', content: '', status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: ContractTemplate) {
  editingRow.value = row
  model.value = { code: row.code, name: row.name, content: row.content, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await contractTemplateApi.update(editingRow.value.id, {
        name: model.value.name,
        content: model.value.content,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('模板已更新')
    } else {
      await contractTemplateApi.create({ code: model.value.code, name: model.value.name, content: model.value.content })
      message.success('模板已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<ContractTemplate> = [
  { key: 'code', title: '编码' },
  { key: 'name', title: '名称' },
  { key: 'content', title: '内容预览', render: (row) => (row.content.length > 30 ? `${row.content.slice(0, 30)}...` : row.content) },
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
      <span />
      <n-button type="primary" @click="openCreateModal">新建模板</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ContractTemplate) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑合同模板' : '新建合同模板'" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="80">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="内容" path="content" :rule="{ required: true, message: '请输入内容' }">
            <n-input v-model:value="model.content" type="textarea" :autosize="{ minRows: 5 }" />
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
