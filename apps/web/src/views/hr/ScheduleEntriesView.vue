<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, NPopconfirm, type DataTableColumns } from 'naive-ui'
import { scheduleEntryApi, employeeProfileApi, shiftDefinitionApi } from '../../api/modules/hr.api'
import { storeApi } from '../../api/modules/store.api'
import type { ScheduleEntry } from '../../api/types/hr'
import type { EmployeeProfile, ShiftDefinition } from '../../api/types/hr'
import type { Store } from '../../api/types/store'
import { message } from '../../utils/discrete-api'

const rows = ref<ScheduleEntry[]>([])
const stores = ref<Store[]>([])
const employeeProfiles = ref<EmployeeProfile[]>([])
const shiftDefinitions = ref<ShiftDefinition[]>([])
const loading = ref(false)

const filterStoreId = ref<string | null>(null)
const filterRange = ref<[number, number] | null>(null)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const employeeOptions = computed(() => employeeProfiles.value.map((e) => ({ label: `${e.account.realName}（${e.employeeNo}）`, value: e.id })))
const shiftOptions = computed(() => shiftDefinitions.value.map((s) => ({ label: s.name, value: s.id })))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await scheduleEntryApi.list({
      storeId: filterStoreId.value ?? undefined,
      startDate: filterRange.value ? new Date(filterRange.value[0]).toISOString() : undefined,
      endDate: filterRange.value ? new Date(filterRange.value[1]).toISOString() : undefined,
    })
  } finally {
    loading.value = false
  }
}

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  employeeProfileId: null as string | null,
  workDate: null as number | null,
  shiftDefinitionId: null as string | null,
  remark: '',
})

function openCreateModal() {
  model.value = { storeId: filterStoreId.value ?? stores.value[0]?.id ?? null, employeeProfileId: null, workDate: Date.now(), shiftDefinitionId: null, remark: '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.employeeProfileId || !model.value.workDate || !model.value.shiftDefinitionId) {
    message.error('请完整选择门店、员工、日期与班次')
    return
  }
  submitting.value = true
  try {
    await scheduleEntryApi.create({
      storeId: model.value.storeId,
      employeeProfileId: model.value.employeeProfileId,
      workDate: new Date(model.value.workDate).toISOString(),
      shiftDefinitionId: model.value.shiftDefinitionId,
      remark: model.value.remark || undefined,
    })
    message.success('排班已创建')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: ScheduleEntry) {
  await scheduleEntryApi.delete(row.id)
  message.success('排班已删除')
  await fetchList()
}

const columns: DataTableColumns<ScheduleEntry> = [
  { key: 'workDate', title: '日期', render: (row) => new Date(row.workDate).toLocaleDateString() },
  { key: 'employee', title: '员工', render: (row) => `${row.employeeProfile.account.realName}（${row.employeeProfile.employeeNo}）` },
  { key: 'shift', title: '班次', render: (row) => `${row.shiftDefinition.name}（${row.shiftDefinition.startTime}-${row.shiftDefinition.endTime}）` },
  { key: 'remark', title: '备注', render: (row) => row.remark ?? '-' },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) =>
      h(NPopconfirm, { onPositiveClick: () => handleDelete(row) }, { trigger: () => h(NButton, { size: 'small' }, { default: () => '删除' }), default: () => '确认删除该排班记录？' }),
  },
]

onMounted(async () => {
  const [storeList, profiles, shifts] = await Promise.all([storeApi.list(), employeeProfileApi.list(), shiftDefinitionApi.list()])
  stores.value = storeList
  employeeProfiles.value = profiles
  shiftDefinitions.value = shifts
  await fetchList()
})
watch([filterStoreId, filterRange], fetchList)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" align="center">
      <n-space align="center">
        <n-select v-model:value="filterStoreId" :options="storeOptions" clearable placeholder="按门店筛选" style="width: min(200px, 94vw)" />
        <n-date-picker v-model:value="filterRange" type="daterange" clearable style="width: min(260px, 94vw)" />
      </n-space>
      <n-button type="primary" @click="openCreateModal">新建排班</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ScheduleEntry) => r.id" :scroll-x="900" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建排班" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="员工"><n-select v-model:value="model.employeeProfileId" :options="employeeOptions" filterable /></n-form-item>
          <n-form-item label="日期"><n-date-picker v-model:value="model.workDate" type="date" style="width: 100%" /></n-form-item>
          <n-form-item label="班次"><n-select v-model:value="model.shiftDefinitionId" :options="shiftOptions" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
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
