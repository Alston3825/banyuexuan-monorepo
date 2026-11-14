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
  NSelect,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { storeApi } from '../../api/modules/store.api'
import { regionApi } from '../../api/modules/region.api'
import type { Store } from '../../api/types/store'
import type { Region } from '../../api/types/region'
import { renderStatusBadge, STORE_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const rows = ref<Store[]>([])
const loading = ref(false)
const regionOptions = ref<{ label: string; value: string }[]>([])

const formVisible = ref(false)
const editingRow = ref<Store | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({ name: '', address: '', regionId: '', status: 'ACTIVE' as Store['status'] })

async function fetchList() {
  loading.value = true
  try {
    rows.value = await storeApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchRegionOptions() {
  const regions = await regionApi.list()
  regionOptions.value = regions.map((r: Region) => ({ label: r.name, value: r.id }))
}

function openCreateModal() {
  editingRow.value = null
  model.value = { name: '', address: '', regionId: '', status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: Store) {
  editingRow.value = row
  model.value = { name: row.name, address: row.address ?? '', regionId: row.regionId, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await storeApi.update(editingRow.value.id, {
        name: model.value.name,
        address: model.value.address,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('门店已更新')
    } else {
      await storeApi.create({
        name: model.value.name,
        address: model.value.address,
        regionId: model.value.regionId,
      })
      message.success('门店已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

/** 门店不支持物理删除，这里做的是"关闭"（转 CLOSED），文案上绝不用"删除"。 */
function confirmClose(row: Store) {
  dialog.warning({
    title: '关闭门店',
    content: `确认关闭「${row.name}」门店？此操作不可撤销，门店将转为已关闭状态。`,
    positiveText: '确认关闭',
    negativeText: '取消',
    onPositiveClick: async () => {
      await storeApi.close(row.id, row.version)
      message.success('门店已关闭')
      await fetchList()
    },
  })
}

const columns: DataTableColumns<Store> = [
  { key: 'name', title: '名称' },
  { key: 'address', title: '地址', render: (row) => row.address ?? '-' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, STORE_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 180,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          h(
            NButton,
            { size: 'small', type: 'warning', quaternary: true, disabled: row.status === 'CLOSED', onClick: () => confirmClose(row) },
            { default: () => '关闭门店' },
          ),
        ],
      }),
  },
]

onMounted(async () => {
  await Promise.all([fetchList(), fetchRegionOptions()])
})
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建门店</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Store) => r.id" :scroll-x="760" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑门店' : '新建门店'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="所属区域" path="regionId" :rule="{ required: true, message: '请选择所属区域' }">
            <n-select v-model:value="model.regionId" :options="regionOptions" />
          </n-form-item>
          <n-form-item label="地址" path="address">
            <n-input v-model:value="model.address" />
          </n-form-item>
          <n-form-item v-if="editingRow" label="状态" path="status">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '筹备中', value: 'PENDING' },
                { label: '营业中', value: 'ACTIVE' },
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
