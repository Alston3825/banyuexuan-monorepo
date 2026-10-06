<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { servicePackageApi } from '../../api/modules/service.api'
import type { ServicePackage } from '../../api/types/service'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<ServicePackage[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<ServicePackage | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  totalSessions: 10,
  price: 0,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await servicePackageApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', totalSessions: 10, price: 0, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: ServicePackage) {
  editingRow.value = row
  model.value = { code: row.code, name: row.name, totalSessions: row.totalSessions, price: row.price, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await servicePackageApi.update(editingRow.value.id, {
        name: model.value.name,
        totalSessions: model.value.totalSessions,
        price: model.value.price,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('服务包已更新')
    } else {
      await servicePackageApi.create({ code: model.value.code, name: model.value.name, totalSessions: model.value.totalSessions, price: model.value.price })
      message.success('服务包已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<ServicePackage> = [
  { key: 'name', title: '服务包名称' },
  { key: 'code', title: '编码' },
  { key: 'totalSessions', title: '总次数' },
  { key: 'price', title: '总价(分)' },
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
      <n-button type="primary" @click="openCreateModal">新建服务包</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ServicePackage) => r.id" :scroll-x="700" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑服务包' : '新建服务包'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 back_10x" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 开背10次卡" />
          </n-form-item>
          <n-form-item label="总次数"><n-input-number v-model:value="model.totalSessions" :min="1" style="width: 100%" /></n-form-item>
          <n-form-item label="总价(分)"><n-input-number v-model:value="model.price" :min="0" style="width: 100%" /></n-form-item>
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
