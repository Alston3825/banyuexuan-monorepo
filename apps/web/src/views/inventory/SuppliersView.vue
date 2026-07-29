<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { supplierApi } from '../../api/modules/inventory.api'
import type { Supplier } from '../../api/types/inventory'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<Supplier[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<Supplier | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  contactName: '',
  phone: '',
  remark: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await supplierApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', contactName: '', phone: '', remark: '', status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: Supplier) {
  editingRow.value = row
  model.value = { code: row.code, name: row.name, contactName: row.contactName ?? '', phone: row.phone ?? '', remark: row.remark ?? '', status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await supplierApi.update(editingRow.value.id, {
        name: model.value.name,
        contactName: model.value.contactName || undefined,
        phone: model.value.phone || undefined,
        remark: model.value.remark || undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('供应商已更新')
    } else {
      await supplierApi.create({
        code: model.value.code,
        name: model.value.name,
        contactName: model.value.contactName || undefined,
        phone: model.value.phone || undefined,
        remark: model.value.remark || undefined,
      })
      message.success('供应商已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<Supplier> = [
  { key: 'name', title: '供应商名称' },
  { key: 'code', title: '编码' },
  { key: 'contactName', title: '联系人', render: (row) => row.contactName ?? '-' },
  { key: 'phone', title: '联系电话', render: (row) => row.phone ?? '-' },
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
      <n-button type="primary" @click="openCreateModal">新建供应商</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Supplier) => r.id" :scroll-x="700" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑供应商' : '新建供应商'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 sup_001" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="联系人"><n-input v-model:value="model.contactName" /></n-form-item>
          <n-form-item label="联系电话"><n-input v-model:value="model.phone" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
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
