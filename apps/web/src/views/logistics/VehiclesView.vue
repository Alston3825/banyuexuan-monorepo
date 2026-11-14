<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { vehicleApi } from '../../api/modules/logistics.api'
import type { Vehicle } from '../../api/types/logistics'
import { renderStatusBadge, VEHICLE_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<Vehicle[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<Vehicle | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  plateNumber: '',
  model: '',
  remark: '',
  status: 'AVAILABLE' as Vehicle['status'],
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await vehicleApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { plateNumber: '', model: '', remark: '', status: 'AVAILABLE' }
  formVisible.value = true
}

function openEditModal(row: Vehicle) {
  editingRow.value = row
  model.value = { plateNumber: row.plateNumber, model: row.model, remark: row.remark ?? '', status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await vehicleApi.update(editingRow.value.id, {
        model: model.value.model,
        remark: model.value.remark || undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('车辆已更新')
    } else {
      await vehicleApi.create({ plateNumber: model.value.plateNumber, model: model.value.model, remark: model.value.remark || undefined })
      message.success('车辆已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<Vehicle> = [
  { key: 'plateNumber', title: '车牌号' },
  { key: 'model', title: '车型' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, VEHICLE_STATUS_MAP) },
  { key: 'remark', title: '备注', render: (row) => row.remark ?? '-' },
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
      <n-button type="primary" @click="openCreateModal">新建车辆</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Vehicle) => r.id" :scroll-x="800" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑车辆' : '新建车辆'" style="width: min(460px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="车牌号" path="plateNumber" :rule="{ required: true, message: '请输入车牌号' }">
            <n-input v-model:value="model.plateNumber" />
          </n-form-item>
          <n-form-item label="车型" path="model" :rule="{ required: true, message: '请输入车型' }">
            <n-input v-model:value="model.model" />
          </n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '可用', value: 'AVAILABLE' },
                { label: '维修中', value: 'MAINTENANCE' },
                { label: '已报废', value: 'RETIRED' },
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
