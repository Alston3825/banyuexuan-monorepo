<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDatePicker, type DataTableColumns } from 'naive-ui'
import { utilityExpenseApi } from '../../api/modules/logistics.api'
import { storeApi } from '../../api/modules/store.api'
import type { UtilityExpense } from '../../api/types/logistics'
import type { Store } from '../../api/types/store'
import { UTILITY_EXPENSE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const rows = ref<UtilityExpense[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const storeNameById = computed(() => new Map(stores.value.map((s) => [s.id, s.name])))

const formVisible = ref(false)
const editingRow = ref<UtilityExpense | null>(null)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  periodMs: null as number | null,
  expenseType: 'ELECTRICITY' as UtilityExpense['expenseType'],
  amountYuan: null as number | null,
  remark: '',
})

function msToPeriod(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await utilityExpenseApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { storeId: stores.value[0]?.id ?? null, periodMs: Date.now(), expenseType: 'ELECTRICITY', amountYuan: null, remark: '' }
  formVisible.value = true
}

function openEditModal(row: UtilityExpense) {
  editingRow.value = row
  const [y, m] = row.period.split('-').map(Number)
  model.value = { storeId: row.storeId, periodMs: new Date(y, m - 1, 1).getTime(), expenseType: row.expenseType, amountYuan: toMajorUnits(row.amount), remark: row.remark ?? '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.periodMs || !model.value.amountYuan) {
    message.error('请完整填写门店、月份与金额')
    return
  }
  submitting.value = true
  try {
    if (editingRow.value) {
      await utilityExpenseApi.update(editingRow.value.id, {
        amount: toMinorUnits(model.value.amountYuan),
        remark: model.value.remark || undefined,
        version: editingRow.value.version,
      })
      message.success('水电费登记已更新')
    } else {
      await utilityExpenseApi.create({
        storeId: model.value.storeId,
        period: msToPeriod(model.value.periodMs),
        expenseType: model.value.expenseType,
        amount: toMinorUnits(model.value.amountYuan)!,
        remark: model.value.remark || undefined,
      })
      message.success('水电费登记已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<UtilityExpense> = [
  { key: 'store', title: '门店', render: (row) => storeNameById.value.get(row.storeId) ?? row.storeId },
  { key: 'period', title: '月份' },
  { key: 'expenseType', title: '类型', render: (row) => UTILITY_EXPENSE_TYPE_LABEL_MAP[row.expenseType] },
  { key: 'amount', title: '金额(元)', render: (row) => (toMajorUnits(row.amount) ?? 0).toFixed(2) },
  { key: 'remark', title: '备注', render: (row) => row.remark ?? '-' },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(async () => {
  stores.value = await storeApi.list()
  await fetchAll()
})
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建水电费登记</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: UtilityExpense) => r.id" :scroll-x="900" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑水电费登记' : '新建水电费登记'" style="width: min(460px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item v-if="!editingRow" label="月份"><n-date-picker v-model:value="model.periodMs" type="month" style="width: 100%" /></n-form-item>
          <n-form-item v-if="!editingRow" label="类型">
            <n-select
              v-model:value="model.expenseType"
              :options="[
                { label: '电费', value: 'ELECTRICITY' },
                { label: '水费', value: 'WATER' },
                { label: '燃气费', value: 'GAS' },
                { label: '物业费', value: 'PROPERTY_MANAGEMENT' },
                { label: '其他', value: 'OTHER' },
              ]"
            />
          </n-form-item>
          <n-form-item label="金额(元)"><n-input-number v-model:value="model.amountYuan" :min="0.01" style="width: 100%" /></n-form-item>
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
