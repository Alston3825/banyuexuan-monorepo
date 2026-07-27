<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, type DataTableColumns, type FormInst } from 'naive-ui'
import { roomTypeApi } from '../../api/modules/room-type.api'
import type { RoomType } from '../../api/types/room-type'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const rows = ref<RoomType[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<RoomType | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({
  code: '',
  name: '',
  description: '',
  standardPriceYuan: null as number | null,
  status: 'ACTIVE' as RoomType['status'],
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await roomTypeApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', description: '', standardPriceYuan: null, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: RoomType) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    standardPriceYuan: toMajorUnits(row.standardPrice),
    status: row.status,
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await roomTypeApi.update(editingRow.value.id, {
        name: model.value.name,
        description: model.value.description,
        standardPrice: toMinorUnits(model.value.standardPriceYuan ?? undefined),
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('房型已更新')
    } else {
      await roomTypeApi.create({
        code: model.value.code,
        name: model.value.name,
        description: model.value.description || undefined,
        standardPrice: toMinorUnits(model.value.standardPriceYuan ?? undefined),
      })
      message.success('房型已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<RoomType> = [
  { key: 'code', title: '编码' },
  { key: 'name', title: '名称' },
  { key: 'standardPrice', title: '参考价（元）', render: (row) => toMajorUnits(row.standardPrice) ?? '-' },
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
      <n-button type="primary" @click="openCreateModal">新建房型</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: RoomType) => r.id" :scroll-x="700" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑房型' : '新建房型'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="描述"><n-input v-model:value="model.description" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
          <n-form-item label="参考价（元）"><n-input-number v-model:value="model.standardPriceYuan" style="width: 100%" /></n-form-item>
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
