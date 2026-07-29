<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NDynamicInput, type DataTableColumns } from 'naive-ui'
import { goodsReceiptApi, purchaseOrderApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { GoodsReceipt, GoodsReceiptItemInput, PurchaseOrder, Warehouse, InventoryItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, INVENTORY_DOC_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<GoodsReceipt[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const purchaseOrders = ref<PurchaseOrder[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const approvedPurchaseOrderOptions = computed(() =>
  purchaseOrders.value.filter((p) => p.status === 'APPROVED').map((p) => ({ label: `${p.orderNo}（${p.supplier.name}）`, value: p.id })),
)
const itemOptions = computed(() => items.value.map((i) => ({ label: `${i.name}（${i.unit}）`, value: i.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  warehouseId: null as string | null,
  purchaseOrderId: null as string | null,
  remark: '',
  items: [] as (GoodsReceiptItemInput & { key: number })[],
})
let itemRowKey = 0

async function fetchAll() {
  loading.value = true
  try {
    const [receipts, storeList, warehouseList, poList, itemList] = await Promise.all([
      goodsReceiptApi.list(),
      storeApi.list(),
      warehouseApi.list(),
      purchaseOrderApi.list(),
      inventoryItemApi.list(),
    ])
    rows.value = receipts
    stores.value = storeList
    warehouses.value = warehouseList
    purchaseOrders.value = poList
    items.value = itemList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, warehouseId: null, purchaseOrderId: null, remark: '', items: [] }
  formVisible.value = true
}

function onPurchaseOrderChange(poId: string | null) {
  const po = purchaseOrders.value.find((p) => p.id === poId)
  if (po) {
    model.value.warehouseId = po.warehouseId
    model.value.items = po.items.map((i) => ({ key: itemRowKey++, itemId: i.itemId, quantity: i.quantity, unitCost: i.unitPrice }))
  }
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1, unitCost: 0 }
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.warehouseId || model.value.items.length === 0) {
    message.error('请完整填写门店/仓库，并至少添加一行入库明细')
    return
  }
  submitting.value = true
  try {
    await goodsReceiptApi.create({
      storeId: model.value.storeId,
      warehouseId: model.value.warehouseId,
      purchaseOrderId: model.value.purchaseOrderId ?? undefined,
      remark: model.value.remark || undefined,
      items: model.value.items.map(({ key: _key, ...i }) => i),
    })
    message.success('入库单已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitReceipt(row: GoodsReceipt) {
  dialog.warning({
    title: '提交',
    content: row.purchaseOrderId ? `确认提交入库单「${row.receiptNo}」？（挂在已批采购单下，将跳过审批）` : `确认提交入库单「${row.receiptNo}」？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await goodsReceiptApi.submit(row.id, row.version)
      message.success('已提交')
      await fetchAll()
    },
  })
}

function handleExecute(row: GoodsReceipt) {
  dialog.warning({
    title: '执行入库',
    content: `确认执行入库单「${row.receiptNo}」？执行后将更新库存与批次，不可撤销。`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await goodsReceiptApi.execute(row.id, row.version)
      message.success('已完成入库')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: GoodsReceipt) {
  const instance = await workflowInstanceApi.findByBusiness('GOODS_RECEIPT', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: GoodsReceipt) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  goodsReceiptApi.cancel(row.id, reason, row.version).then(() => {
    message.success('入库单已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<GoodsReceipt> = [
  { key: 'receiptNo', title: '入库单号' },
  { key: 'warehouse', title: '仓库', render: (row) => row.warehouse.name },
  { key: 'purchaseOrder', title: '关联采购单', render: (row) => row.purchaseOrder?.orderNo ?? '无(临时入库)' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, INVENTORY_DOC_STATUS_MAP) },
  { key: 'createdAt', title: '创建时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 260,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitReceipt(row) }, { default: () => '提交' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'PENDING_APPROVAL') {
        buttons.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'APPROVED') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleExecute(row) }, { default: () => '执行入库' }))
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
      <n-button type="primary" @click="openCreateModal">新建入库单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: GoodsReceipt) => r.id" :scroll-x="1000" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建入库单" style="width: 680px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="关联采购单">
            <n-select v-model:value="model.purchaseOrderId" :options="approvedPurchaseOrderOptions" clearable placeholder="不选=临时入库，按仓库配置决定是否需要审批" @update:value="onPurchaseOrderChange" />
          </n-form-item>
          <n-form-item label="入库仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" :disabled="!!model.purchaseOrderId" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="入库明细">
            <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%">
                <n-select v-model:value="value.itemId" :options="itemOptions" filterable placeholder="物品" style="width: 200px" />
                <n-input-number v-model:value="value.quantity" :min="1" placeholder="数量" style="width: 120px" />
                <n-input-number v-model:value="value.unitCost" :min="0" placeholder="单位成本(分)" style="width: 140px" />
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
