<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NTimePicker, NText, type DataTableColumns, type FormInst } from 'naive-ui'
import { shiftDefinitionApi } from '../../api/modules/hr.api'
import { storeApi } from '../../api/modules/store.api'
import type { ShiftDefinition } from '../../api/types/hr'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<ShiftDefinition[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const storeNameById = computed(() => new Map(stores.value.map((s) => [s.id, s.name])))

const formVisible = ref(false)
const editingRow = ref<ShiftDefinition | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  storeId: null as string | null,
  code: '',
  name: '',
  startTimeMs: null as number | null,
  endTimeMs: null as number | null,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

function toTimeString(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function timeStringToMs(value: string): number {
  const [hh, mm] = value.split(':').map(Number)
  const d = new Date()
  d.setHours(hh, mm, 0, 0)
  return d.getTime()
}

async function fetchAll() {
  loading.value = true
  try {
    const [shifts, storeList] = await Promise.all([shiftDefinitionApi.list(), storeApi.list()])
    rows.value = shifts
    stores.value = storeList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { storeId: stores.value[0]?.id ?? null, code: '', name: '', startTimeMs: null, endTimeMs: null, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: ShiftDefinition) {
  editingRow.value = row
  model.value = { storeId: row.storeId, code: row.code, name: row.name, startTimeMs: timeStringToMs(row.startTime), endTimeMs: timeStringToMs(row.endTime), status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (model.value.startTimeMs === null || model.value.endTimeMs === null) {
    message.error('请选择班次开始与结束时间')
    return
  }
  submitting.value = true
  try {
    const startTime = toTimeString(model.value.startTimeMs)
    const endTime = toTimeString(model.value.endTimeMs)
    if (editingRow.value) {
      await shiftDefinitionApi.update(editingRow.value.id, { name: model.value.name, startTime, endTime, status: model.value.status, version: editingRow.value.version })
      message.success('班次已更新')
    } else {
      if (!model.value.storeId) {
        message.error('请选择所属门店')
        return
      }
      await shiftDefinitionApi.create({ storeId: model.value.storeId, code: model.value.code, name: model.value.name, startTime, endTime })
      message.success('班次已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<ShiftDefinition> = [
  { key: 'name', title: '班次名称' },
  { key: 'code', title: '编码' },
  { key: 'store', title: '所属门店', render: (row) => storeNameById.value.get(row.storeId) ?? row.storeId },
  { key: 'time', title: '时段', render: (row) => `${row.startTime} - ${row.endTime}` },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  { key: 'actions', title: '操作', width: 100, render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }) },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建班次</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ShiftDefinition) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑班次' : '新建班次'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="所属门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 day_shift" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 白班/夜班/护士早班" />
          </n-form-item>
          <n-form-item label="时段">
            <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
              <n-time-picker v-model:value="model.startTimeMs" format="HH:mm" style="width: 100%" placeholder="开始时间" />
              <n-text>至</n-text>
              <n-time-picker v-model:value="model.endTimeMs" format="HH:mm" style="width: 100%" placeholder="结束时间（跨零点班次可小于开始时间）" />
            </n-space>
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
