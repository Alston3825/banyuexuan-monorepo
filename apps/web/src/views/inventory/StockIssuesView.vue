<script setup lang="ts">
import { computed, h, onMounted, ref, watch, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NDynamicInput, NAlert, type DataTableColumns } from 'naive-ui'
import { stockIssueApi, warehouseApi, inventoryItemApi, warehouseStockApi } from '../../api/modules/inventory.api'
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
// 选了仓库后，取这个仓库每种物品的现有库存：下拉里直接显示，数量超过库存就不让提交
const stockByItem = ref<Map<string, number>>(new Map())
const stockLoaded = ref(false)
const stockOf = (itemId: string) => stockByItem.value.get(itemId) ?? 0
const itemOptions = computed(() =>
  items.value
    .map((i) => ({ i, q: stockOf(i.id) }))
    .sort((a, b) => (b.q > 0 ? 1 : 0) - (a.q > 0 ? 1 : 0))
    .map(({ i, q }) => ({
      label: stockLoaded.value ? `${i.name}（${i.unit}）· 现有库存 ${q}${q <= 0 ? '（无库存）' : ''}` : `${i.name}（${i.unit}）`,
      value: i.id,
      disabled: stockLoaded.value && q <= 0,
    })),
)

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
  stockLoaded.value = false
  stockByItem.value = new Map()
  formVisible.value = true
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1 }
}

async function loadStocks(warehouseId: string | null) {
  stockLoaded.value = false
  stockByItem.value = new Map()
  if (!warehouseId) return
  try {
    const list = await warehouseStockApi.list({ warehouseId })
    stockByItem.value = new Map(list.map((st) => [st.itemId, st.quantity]))
    stockLoaded.value = true
  } catch {
    /* 没有查看库存的权限时取不到：不影响新建，提交时后端仍会校验库存 */
  }
}
watch(() => model.value.warehouseId, loadStocks)

/** 同一个物品在几行里重复选，按合计和库存比 */
const usedByItem = computed(() => {
  const m = new Map<string, number>()
  for (const r of model.value.items) if (r.itemId) m.set(r.itemId, (m.get(r.itemId) ?? 0) + (r.quantity ?? 0))
  return m
})
const itemName = (id: string) => items.value.find((i) => i.id === id)?.name ?? '该物品'
/** 领用数量大于现有库存的物品（提示用） */
const overItems = computed(() => {
  if (!stockLoaded.value) return []
  return [...usedByItem.value.entries()].filter(([id, used]) => used > stockOf(id)).map(([id, used]) => ({ id, used, stock: stockOf(id) }))
})
const rowOver = (r: { itemId: string; quantity?: number | null }) => stockLoaded.value && !!r.itemId && usedByItem.value.has(r.itemId) && (usedByItem.value.get(r.itemId) ?? 0) > stockOf(r.itemId)

async function handleSubmit() {
  if (!model.value.storeId || !model.value.warehouseId || model.value.items.length === 0) {
    message.error('请完整填写门店/仓库，并至少添加一行明细')
    return
  }
  if (model.value.items.some((i) => !i.itemId)) return void message.error('有一行还没选物品')
  if (overItems.value.length > 0) {
    const o = overItems.value[0]
    return void message.error(`「${itemName(o.id)}」领用数量 ${o.used} 大于现有库存 ${o.stock}，无法提交`)
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
      <n-card title="新建出库/领用单" style="width: min(820px, 96vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" /></n-form-item>
          <n-form-item label="类型"><n-select v-model:value="model.issueType" :options="ISSUE_TYPE_OPTIONS" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" placeholder="领用类型建议登记领用部门/用途" /></n-form-item>
          <n-form-item label="出库明细">
            <div style="width: 100%">
              <n-alert v-if="!model.warehouseId" type="info" :show-icon="false" style="margin-bottom: 8px">先选仓库，选好后物品下拉里会显示每种物品的现有库存。</n-alert>
              <n-alert v-for="o in overItems" :key="o.id" type="error" :show-icon="false" style="margin-bottom: 6px">
                ⚠「{{ itemName(o.id) }}」领用数量 {{ o.used }} 大于现有库存 {{ o.stock }}，无法提交，请减少数量。
              </n-alert>
              <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
                <n-space :wrap="true" :size="[8, 4]" align="center" style="width: 100%">
                  <n-select v-model:value="value.itemId" :options="itemOptions" filterable placeholder="物品（可输入名称搜索）" style="width: min(300px, 94vw)" />
                  <n-input-number v-model:value="value.quantity" :min="1" :precision="0" :status="rowOver(value) ? 'error' : undefined" placeholder="数量" style="width: min(130px, 94vw)" />
                  <span v-if="value.itemId && stockLoaded" :style="{ whiteSpace: 'nowrap', color: rowOver(value) ? '#d03050' : '#18a058', fontSize: '13px' }">
                    现有库存 {{ stockOf(value.itemId) }} {{ items.find((i) => i.id === value.itemId)?.unit }}<template v-if="rowOver(value)">，库存不足</template>
                  </span>
                </n-space>
              </n-dynamic-input>
            </div>
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" :disabled="overItems.length > 0" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
