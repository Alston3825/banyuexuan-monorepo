<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { therapistApi } from '../../api/modules/service.api'
import { storeApi } from '../../api/modules/store.api'
import type { Therapist } from '../../api/types/service'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<Therapist[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const storeNameById = computed(() => new Map(stores.value.map((s) => [s.id, s.name])))

const formVisible = ref(false)
const editingRow = ref<Therapist | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  storeId: null as string | null,
  name: '',
  phone: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchAll() {
  loading.value = true
  try {
    const [therapists, storeList] = await Promise.all([therapistApi.list(), storeApi.list()])
    rows.value = therapists
    stores.value = storeList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { storeId: stores.value[0]?.id ?? null, name: '', phone: '', status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: Therapist) {
  editingRow.value = row
  model.value = { storeId: row.storeId, name: row.name, phone: row.phone ?? '', status: row.status }
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
      await therapistApi.update(editingRow.value.id, { name: model.value.name, phone: model.value.phone || undefined, status: model.value.status, version: editingRow.value.version })
      message.success('技师已更新')
    } else {
      await therapistApi.create({ storeId: model.value.storeId, name: model.value.name, phone: model.value.phone || undefined })
      message.success('技师已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<Therapist> = [
  { key: 'name', title: '技师姓名' },
  { key: 'store', title: '所属门店', render: (row) => storeNameById.value.get(row.storeId) ?? row.storeId },
  { key: 'phone', title: '联系电话', render: (row) => row.phone ?? '-' },
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
      <n-button type="primary" @click="openCreateModal">新建技师</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Therapist) => r.id" :scroll-x="700" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑技师' : '新建技师'" style="width: 460px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="所属门店">
            <n-select v-model:value="model.storeId" :options="storeOptions" />
          </n-form-item>
          <n-form-item label="姓名" path="name" :rule="{ required: true, message: '请输入姓名' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="联系电话"><n-input v-model:value="model.phone" /></n-form-item>
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
