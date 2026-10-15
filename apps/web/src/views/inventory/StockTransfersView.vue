<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NDynamicInput, NAlert, type DataTableColumns } from 'naive-ui'
import { stockTransferApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import type { StockTransfer, StockTransferItemInput, Warehouse, InventoryItem } from '../../api/types/inventory'
import ItemSelect from '../../components/inventory/ItemSelect.vue'
import { useWarehouseStockMap } from '../../composables/useWarehouseStockMap'
import { docMatches } from '../../utils/item-search'
import { renderStatusBadge, INVENTORY_DOC_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<StockTransfer[]>([])
const warehouses = ref<Warehouse[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)

const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  fromWarehouseId: null as string | null,
  toWarehouseId: null as string | null,
  remark: '',
  items: [] as (StockTransferItemInput & { key: number })[],
})
let itemRowKey = 0

const keyword = ref('')
const shown = computed(() => rows.value.filter((r) => docMatches(keyword.value, [r.transferNo, r.fromWarehouse?.name, r.toWarehouse?.name, r.remark], r.items)))

// 调出仓库里每种物品的现有库存：下拉里和每行都显示，调拨数量超过库存就拦住
const fromRef = computed(() => model.value.fromWarehouseId)
const { stock, loaded: stockLoaded, stockOf, overOf } = useWarehouseStockMap(fromRef)
const overItems = computed(() => overOf(model.value.items))
const itemName = (id: string) => items.value.find((i) => i.id === id)?.name ?? '该物品'
const unitOf = (id: string) => items.value.find((i) => i.id === id)?.unit ?? ''
const rowOver = (r: { itemId: string }) => !!r.itemId && overItems.value.some((o) => o.id === r.itemId)

async function fetchAll() {
  loading.value = true
  try {
    const [transfers, warehouseList, itemList] = await Promise.all([stockTransferApi.list(), warehouseApi.list(), inventoryItemApi.list()])
    rows.value = transfers
    warehouses.value = warehouseList
    items.value = itemList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { fromWarehouseId: null, toWarehouseId: null, remark: '', items: [] }
  formVisible.value = true
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1 }
}

async function handleSubmit() {
  if (!model.value.fromWarehouseId || !model.value.toWarehouseId || model.value.items.length === 0) {
    message.error('请完整填写调出/调入仓库，并至少添加一行明细')
    return
  }
  if (model.value.fromWarehouseId === model.value.toWarehouseId) {
    message.error('调出仓库与调入仓库不能相同')
    return
  }
  if (model.value.items.some((i) => !i.itemId)) return void message.error('有一行还没选物品')
  if (overItems.value.length > 0) {
    const o = overItems.value[0]
    return void message.error(`「${itemName(o.id)}」调拨数量 ${o.used} 大于调出仓库现有库存 ${o.stock}，无法提交`)
  }
  submitting.value = true
  try {
    await stockTransferApi.create({
      fromWarehouseId: model.value.fromWarehouseId,
      toWarehouseId: model.value.toWarehouseId,
      remark: model.value.remark || undefined,
      items: model.value.items.map(({ key: _key, ...i }) => i),
    })
    message.success('调拨单已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitTransfer(row: StockTransfer) {
  dialog.warning({
    title: '提交',
    content: `确认提交调拨单「${row.transferNo}」？（是否需要审批取决于源仓库配置）`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await stockTransferApi.submit(row.id, row.version)
      message.success('已提交')
      await fetchAll()
    },
  })
}

function handleExecute(row: StockTransfer) {
  dialog.warning({
    title: '执行调拨',
    content: `确认执行调拨单「${row.transferNo}」？执行后将完成库存搬家，不可撤销。`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await stockTransferApi.execute(row.id, row.version)
      message.success('已完成调拨')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: StockTransfer) {
  const instance = await workflowInstanceApi.findByBusiness('STOCK_TRANSFER', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: StockTransfer) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  stockTransferApi.cancel(row.id, reason, row.version).then(() => {
    message.success('已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<StockTransfer> = [
  { key: 'transferNo', title: '单号' },
  { key: 'fromWarehouse', title: '调出仓库', render: (row) => row.fromWarehouse.name },
  { key: 'toWarehouse', title: '调入仓库', render: (row) => row.toWarehouse.name },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, INVENTORY_DOC_STATUS_MAP) },
  { key: 'createdAt', title: '创建时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 260,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitTransfer(row) }, { default: () => '提交' }))
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
    <n-space justify="space-between" align="center" style="margin-bottom: 12px" :wrap="true">
      <n-input v-model:value="keyword" clearable placeholder="🔍 搜索：单号 / 物品名称（支持拼音首字母）/ 仓库" style="width: min(360px, 94vw)" />
      <n-button type="primary" @click="openCreateModal">新建调拨单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="shown" :loading="loading" :row-key="(r: StockTransfer) => r.id" :scroll-x="1000" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建调拨单" style="width: min(820px, 96vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="调出仓库"><n-select v-model:value="model.fromWarehouseId" :options="warehouseOptions" /></n-form-item>
          <n-form-item label="调入仓库"><n-select v-model:value="model.toWarehouseId" :options="warehouseOptions" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="调拨明细">
            <div style="width: 100%">
              <n-alert v-if="!model.fromWarehouseId" type="info" :show-icon="false" style="margin-bottom: 8px">先选调出仓库，选好后物品下拉里会显示每种物品在调出仓库的现有库存。</n-alert>
              <n-alert v-for="o in overItems" :key="o.id" type="error" :show-icon="false" style="margin-bottom: 6px">
                ⚠「{{ itemName(o.id) }}」调拨数量 {{ o.used }} 大于调出仓库现有库存 {{ o.stock }}，无法提交，请减少数量。
              </n-alert>
              <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
                <n-space :wrap="true" :size="[8, 4]" align="center" style="width: 100%">
                  <item-select v-model="value.itemId" :items="items" :stock="stockLoaded ? stock : null" :disable-empty="true" style="width: min(360px, 94vw)" />
                  <n-input-number v-model:value="value.quantity" :min="1" :precision="0" :status="rowOver(value) ? 'error' : undefined" placeholder="数量" style="width: min(130px, 94vw)" />
                  <span v-if="value.itemId && stockLoaded" :style="{ whiteSpace: 'nowrap', color: rowOver(value) ? '#d03050' : '#18a058', fontSize: '13px' }">
                    调出仓库现有库存 {{ stockOf(value.itemId) }} {{ unitOf(value.itemId) }}<template v-if="rowOver(value)">，库存不足</template>
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
