<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { inventoryItemApi } from '../../api/modules/inventory.api'
import type { InventoryItem } from '../../api/types/inventory'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<InventoryItem[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<InventoryItem | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  unit: '',
  category: '',
  safetyStockThreshold: null as number | null,
  shelfLifeDays: null as number | null,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await inventoryItemApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', unit: '', category: '', safetyStockThreshold: null, shelfLifeDays: null, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: InventoryItem) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    unit: row.unit,
    category: row.category ?? '',
    safetyStockThreshold: row.safetyStockThreshold,
    shelfLifeDays: row.shelfLifeDays,
    status: row.status,
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await inventoryItemApi.update(editingRow.value.id, {
        name: model.value.name,
        category: model.value.category || undefined,
        safetyStockThreshold: model.value.safetyStockThreshold ?? undefined,
        shelfLifeDays: model.value.shelfLifeDays ?? undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('物品已更新')
    } else {
      await inventoryItemApi.create({
        code: model.value.code,
        name: model.value.name,
        unit: model.value.unit,
        category: model.value.category || undefined,
        safetyStockThreshold: model.value.safetyStockThreshold ?? undefined,
        shelfLifeDays: model.value.shelfLifeDays ?? undefined,
      })
      message.success('物品已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<InventoryItem> = [
  { key: 'name', title: '物品名称' },
  { key: 'code', title: '编码' },
  { key: 'unit', title: '计量单位' },
  { key: 'safetyStockThreshold', title: '安全库存阈值', render: (row) => row.safetyStockThreshold ?? '不预警' },
  { key: 'shelfLifeDays', title: '保质期(天)', render: (row) => row.shelfLifeDays ?? '不追踪' },
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
      <n-button type="primary" @click="openCreateModal">新建物品</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: InventoryItem) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑物品' : '新建物品'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="110">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 egg" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="计量单位" path="unit" :rule="{ required: true, message: '请输入计量单位' }">
            <n-input v-model:value="model.unit" placeholder="如 kg/件/箱" />
          </n-form-item>
          <n-form-item label="分类"><n-input v-model:value="model.category" /></n-form-item>
          <n-form-item label="安全库存阈值"><n-input-number v-model:value="model.safetyStockThreshold" :min="0" style="width: 100%" placeholder="留空=不预警" /></n-form-item>
          <n-form-item label="保质期(天)"><n-input-number v-model:value="model.shelfLifeDays" :min="1" style="width: 100%" placeholder="留空=不追踪效期" /></n-form-item>
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
