<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NDynamicInput, type DataTableColumns } from 'naive-ui'
import { stockIssueApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { StockIssue, StockIssueItemInput, StockIssueType, Warehouse, InventoryItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, INVENTORY_DOC_STATUS_MAP, STOCK_ISSUE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()
const ISSUE_TYPE_OPTIONS = Object.entries(STOCK_ISSUE_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))

const rows = ref<StockIssue[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const itemOptions = computed(() => items.value.map((i) => ({ label: `${i.name}（${i.unit}）`, value: i.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  warehouseId: null as string | null,
  issueType: 'ISSUE' as StockIssueType,
  remark: '',
  items: [] as (StockIssueItemInput & { key: number })[],
})
let itemRowKey = 0

async function fetchAll() {
  loading.value = true
  try {
    const [issues, storeList, warehouseList, itemList] = await Promise.all([stockIssueApi.list(), storeApi.list(), warehouseApi.list(), inventoryItemApi.list()])
    rows.value = issues
    stores.value = storeList
    warehouses.value = warehouseList
    items.value = itemList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, warehouseId: null, issueType: 'ISSUE', remark: '', items: [] }
  formVisible.value = true
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1 }
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.warehouseId || model.value.items.length === 0) {
    message.error('请完整填写门店/仓库，并至少添加一行明细')
    return
  }
  submitting.value = true
  try {
    await stockIssueApi.create({
      storeId: model.value.storeId,
      warehouseId: model.value.warehouseId,
      issueType: model.value.issueType,
      remark: model.value.remark || undefined,
      items: model.value.items.map(({ key: _key, ...i }) => i),
    })
    message.success('出库/领用单已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitIssue(row: StockIssue) {
  dialog.warning({
    title: '提交',
    content: `确认提交「${row.issueNo}」？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await stockIssueApi.submit(row.id, row.version)
      message.success('已提交')
      await fetchAll()
    },
  })
}

function handleExecute(row: StockIssue) {
  dialog.warning({
    title: '执行出库',
    content: `确认执行「${row.issueNo}」？执行后将扣减库存与批次，不可撤销。`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await stockIssueApi.execute(row.id, row.version)
      message.success('已完成出库')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: StockIssue) {
  const instance = await workflowInstanceApi.findByBusiness('STOCK_ISSUE', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: StockIssue) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  stockIssueApi.cancel(row.id, reason, row.version).then(() => {
    message.success('已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<StockIssue> = [
  { key: 'issueNo', title: '单号' },
  { key: 'issueType', title: '类型', render: (row) => STOCK_ISSUE_TYPE_LABEL_MAP[row.issueType] },
  { key: 'warehouse', title: '仓库', render: (row) => row.warehouse.name },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, INVENTORY_DOC_STATUS_MAP) },
  { key: 'createdAt', title: '创建时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 260,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitIssue(row) }, { default: () => '提交' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'PENDING_APPROVAL') {
        buttons.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'APPROVED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleExecute(row) }, { default: () => '执行' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      }
      return h(NSpace, {}, { default: () => buttons })
    },
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建出库/领用单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: StockIssue) => r.id" :scroll-x="1000" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建出库/领用单" style="width: min(680px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" /></n-form-item>
          <n-form-item label="类型"><n-select v-model:value="model.issueType" :options="ISSUE_TYPE_OPTIONS" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" placeholder="领用类型建议登记领用部门/用途" /></n-form-item>
          <n-form-item label="出库明细">
            <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                <n-select v-model:value="value.itemId" :options="itemOptions" filterable placeholder="物品" style="width: min(240px, 94vw)" />
                <n-input-number v-model:value="value.quantity" :min="1" placeholder="数量" style="width: min(140px, 94vw)" />
              </n-space>
            </n-dynamic-input>
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
