<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NSwitch, NTag, type DataTableColumns, type FormInst } from 'naive-ui'
import { warehouseApi } from '../../api/modules/inventory.api'
import { storeApi } from '../../api/modules/store.api'
import type { Warehouse } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, COMMON_STATUS_MAP, WAREHOUSE_PURPOSE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<Warehouse[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const storeNameById = computed(() => new Map(stores.value.map((s) => [s.id, s.name])))

const formVisible = ref(false)
const editingRow = ref<Warehouse | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  storeId: null as string | null,
  code: '',
  name: '',
  purpose: 'OPERATING' as Warehouse['purpose'],
  requiresApproval: true,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchAll() {
  loading.value = true
  try {
    // 门店下拉和仓库列表分开取：门店取不到也不影响仓库列表显示
    const [warehouses, storeList] = await Promise.all([warehouseApi.list(), storeApi.list().catch(() => [] as Store[])])
    rows.value = warehouses
    stores.value = storeList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { storeId: stores.value[0]?.id ?? null, code: '', name: '', purpose: 'OPERATING', requiresApproval: true, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: Warehouse) {
  editingRow.value = row
  model.value = { storeId: row.storeId, code: row.code, name: row.name, purpose: row.purpose, requiresApproval: row.requiresApproval, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (!model.value.storeId) {
    message.error('请选择所属门店')
    return
  }
  submitting.value = true
  try {
    if (editingRow.value) {
      await warehouseApi.update(editingRow.value.id, {
        name: model.value.name,
        requiresApproval: model.value.requiresApproval,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('仓库已更新')
    } else {
      await warehouseApi.create({
        storeId: model.value.storeId,
        code: model.value.code,
        name: model.value.name,
        purpose: model.value.purpose,
        requiresApproval: model.value.requiresApproval,
      })
      message.success('仓库已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<Warehouse> = [
  { key: 'name', title: '仓库名称' },
  { key: 'code', title: '编码' },
  { key: 'store', title: '所属门店', render: (row) => storeNameById.value.get(row.storeId) ?? row.storeId },
  { key: 'purpose', title: '用途', render: (row) => WAREHOUSE_PURPOSE_LABEL_MAP[row.purpose] },
  {
    key: 'requiresApproval',
    title: '审批要求',
    render: (row) => h(NTag, { size: 'small', type: row.requiresApproval ? 'warning' : 'success' }, { default: () => (row.requiresApproval ? '需审批' : '免审批') }),
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
      <n-button type="primary" @click="openCreateModal">新建仓库</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Warehouse) => r.id" :scroll-x="800" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑仓库' : '新建仓库'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="所属门店">
            <n-select v-model:value="model.storeId" :options="storeOptions" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 wh_main" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="用途">
            <n-select
              v-model:value="model.purpose"
              :options="[
                { label: '经营性', value: 'OPERATING' },
                { label: '后勤/办公用品', value: 'LOGISTICS' },
              ]"
            />
          </n-form-item>
          <n-form-item label="需要审批">
            <n-switch v-model:value="model.requiresApproval" />
            <span style="margin-left: 8px; color: var(--n-text-color-3, var(--c-999999)); font-size: 12px">关闭后该仓库的入库/出库/领用/调拨/盘点单可直接执行，无需审批</span>
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
