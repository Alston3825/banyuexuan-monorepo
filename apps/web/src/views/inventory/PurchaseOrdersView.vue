<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NDynamicInput, type DataTableColumns } from 'naive-ui'
import { purchaseOrderApi, supplierApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { PurchaseOrder, PurchaseOrderItemInput, Supplier, Warehouse, InventoryItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, INVENTORY_DOC_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<PurchaseOrder[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const suppliers = ref<Supplier[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const supplierOptions = computed(() => suppliers.value.map((s) => ({ label: s.name, value: s.id })))
const itemOptions = computed(() => items.value.map((i) => ({ label: `${i.name}（${i.unit}）`, value: i.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  warehouseId: null as string | null,
  supplierId: null as string | null,
  remark: '',
  items: [] as (PurchaseOrderItemInput & { key: number })[],
})
let itemRowKey = 0

async function fetchAll() {
  loading.value = true
  try {
    const [orders, storeList, warehouseList, supplierList, itemList] = await Promise.all([
      purchaseOrderApi.list(),
      storeApi.list(),
      warehouseApi.list(),
      supplierApi.list(),
      inventoryItemApi.list(),
    ])
    rows.value = orders
    stores.value = storeList
    warehouses.value = warehouseList
    suppliers.value = supplierList
    items.value = itemList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, warehouseId: null, supplierId: null, remark: '', items: [] }
  formVisible.value = true
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1, unitPrice: 0 }
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.warehouseId || !model.value.supplierId || model.value.items.length === 0) {
    message.error('请完整填写门店/仓库/供应商，并至少添加一行采购明细')
    return
  }
  submitting.value = true
  try {
    await purchaseOrderApi.create({
      storeId: model.value.storeId,
      warehouseId: model.value.warehouseId,
      supplierId: model.value.supplierId,
      remark: model.value.remark || undefined,
      items: model.value.items.map(({ key: _key, ...i }) => i),
    })
    message.success('采购单已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitOrder(row: PurchaseOrder) {
  dialog.warning({
    title: '提交审核',
    content: `确认提交采购单「${row.orderNo}」进入审批流程？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await purchaseOrderApi.submit(row.id, row.version)
      message.success('已提交审批')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: PurchaseOrder) {
  const instance = await workflowInstanceApi.findByBusiness('PURCHASE_ORDER', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancelOrder(row: PurchaseOrder) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  purchaseOrderApi.cancel(row.id, reason, row.version).then(() => {
    message.success('采购单已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<PurchaseOrder> = [
  { key: 'orderNo', title: '采购单号' },
  { key: 'supplier', title: '供应商', render: (row) => row.supplier.name },
  { key: 'warehouse', title: '入库仓库', render: (row) => row.warehouse.name },
  { key: 'totalAmount', title: '总金额(分)', render: (row) => row.totalAmount },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, INVENTORY_DOC_STATUS_MAP) },
  { key: 'createdAt', title: '创建时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitOrder(row) }, { default: () => '提交审核' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancelOrder(row) }, { default: () => '取消' }))
      } else if (row.status === 'PENDING_APPROVAL') {
        buttons.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancelOrder(row) }, { default: () => '取消' }))
      } else if (row.status === 'APPROVED') {
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancelOrder(row) }, { default: () => '取消' }))
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
      <n-button type="primary" @click="openCreateModal">新建采购单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: PurchaseOrder) => r.id" :scroll-x="1000" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建采购单" style="width: 680px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="入库仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" placeholder="采购单批准后，据此仓库登记入库" /></n-form-item>
          <n-form-item label="供应商"><n-select v-model:value="model.supplierId" :options="supplierOptions" filterable /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="采购明细">
            <n-dynamic-input v-model:value="model.items" :on-create="createItemRow" #="{ value }">
              <n-space :wrap="false" align="center" style="width: 100%">
                <n-select v-model:value="value.itemId" :options="itemOptions" filterable placeholder="物品" style="width: 200px" />
                <n-input-number v-model:value="value.quantity" :min="1" placeholder="数量" style="width: 120px" />
                <n-input-number v-model:value="value.unitPrice" :min="0" placeholder="单价(分)" style="width: 140px" />
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
