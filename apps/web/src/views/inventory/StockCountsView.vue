<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, type DataTableColumns } from 'naive-ui'
import { stockCountApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { StockCount, StockCountItemInput, Warehouse, InventoryItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import ItemSelect from '../../components/inventory/ItemSelect.vue'
import LineListEditor from '../../components/inventory/LineListEditor.vue'
import { useWarehouseStockMap } from '../../composables/useWarehouseStockMap'
import { docMatches, itemMatches } from '../../utils/item-search'
import { renderStatusBadge, INVENTORY_DOC_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useFormDraft } from '../../composables/useFormDraft'

const router = useRouter()

const rows = ref<StockCount[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  warehouseId: null as string | null,
  remark: '',
  items: [] as (StockCountItemInput & { key: number })[],
})
let itemRowKey = 0
// 单据填到一半被刷新/闪退/误关：重新打开能恢复
const draft = useFormDraft('stock-count-create', model, (m) => m.items.length === 0 && !m.remark && !m.warehouseId, (m) => {
  itemRowKey = Math.max(itemRowKey, ...m.items.map((i) => i.key + 1), 0)
})

const keyword = ref('')
const shown = computed(() => rows.value.filter((r) => docMatches(keyword.value, [r.countNo, r.warehouse?.name, r.remark], r.items)))
// 盘点的仓库里每种物品的系统库存：下拉里显示，方便对着数
const whRef = computed(() => model.value.warehouseId)
const { stock, loaded: stockLoaded, stockOf } = useWarehouseStockMap(whRef)
const unitOf = (id: string) => items.value.find((i) => i.id === id)?.unit ?? ''
// 盘点明细（查看）里按物品搜
const detailKeyword = ref('')

async function fetchAll() {
  loading.value = true
  try {
    const [counts, storeList, warehouseList, itemList] = await Promise.all([stockCountApi.list(), storeApi.list(), warehouseApi.list(), inventoryItemApi.list()])
    rows.value = counts
    stores.value = storeList
    warehouses.value = warehouseList
    items.value = itemList
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, warehouseId: null, remark: '', items: [] }
  formVisible.value = true
  draft.start()
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', countedQuantity: 0 }
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.warehouseId || model.value.items.length === 0) {
    message.error('请完整填写门店/仓库，并至少添加一行盘点明细')
    return
  }
  submitting.value = true
  try {
    await stockCountApi.create({
      storeId: model.value.storeId,
      warehouseId: model.value.warehouseId,
      remark: model.value.remark || undefined,
      items: model.value.items.map(({ key: _key, ...i }) => i),
    })
    message.success('盘点单已创建')
    draft.clear()
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitCount(row: StockCount) {
  dialog.warning({
    title: '提交',
    content: `确认提交盘点单「${row.countNo}」进行盈亏调整审批？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await stockCountApi.submit(row.id, row.version)
      message.success('已提交')
      await fetchAll()
    },
  })
}

function handleExecute(row: StockCount) {
  dialog.warning({
    title: '执行盘点',
    content: `确认执行盘点单「${row.countNo}」？执行后将按盘点结果修正库存，不可撤销。`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await stockCountApi.execute(row.id, row.version)
      message.success('已完成盘点调整')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: StockCount) {
  const instance = await workflowInstanceApi.findByBusiness('STOCK_COUNT', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: StockCount) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  stockCountApi.cancel(row.id, reason, row.version).then(() => {
    message.success('已取消')
    fetchAll()
  })
}

// ---------------- 查看盘点明细（系统数量/盘点数量/差异） ----------------
const detailVisible = ref(false)
const detailRow = ref<StockCount | null>(null)

async function openDetail(row: StockCount) {
  detailKeyword.value = ""
  detailRow.value = await stockCountApi.get(row.id)
  detailVisible.value = true
}

const columns: DataTableColumns<StockCount> = [
  { key: 'countNo', title: '单号' },
  { key: 'warehouse', title: '仓库', render: (row) => row.warehouse.name },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, INVENTORY_DOC_STATUS_MAP) },
  { key: 'createdAt', title: '创建时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 320,
    render: (row) => {
      const buttons: VNode[] = [h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => '查看明细' })]
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitCount(row) }, { default: () => '提交' }))
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
      <n-button type="primary" @click="openCreateModal">新建盘点单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="shown" :loading="loading" :row-key="(r: StockCount) => r.id" :scroll-x="1000" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建盘点单" style="width: min(820px, 96vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="盘点明细">
            <line-list-editor v-model="model.items" :on-create="createItemRow" add-text="添加一个盘点物品" #="{ value }">
              <n-space :wrap="true" :size="[8, 4]" align="center" style="width: 100%">
                <item-select v-model="value.itemId" :items="items" :stock="stockLoaded ? stock : null" style="width: min(360px, 94vw)" />
                <n-input-number v-model:value="value.countedQuantity" :min="0" placeholder="实际盘点数量" style="width: min(160px, 94vw)" />
                <span v-if="value.itemId && stockLoaded" style="white-space: nowrap; color: #18a058; font-size: 13px">系统库存 {{ stockOf(value.itemId) }} {{ unitOf(value.itemId) }}</span>
              </n-space>
            </line-list-editor>
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

    <n-modal :show="detailVisible" @update:show="(v) => (detailVisible = v)">
      <n-card v-if="detailRow" :title="`盘点明细：${detailRow.countNo}`" style="width: min(640px, 96vw)" :bordered="false" role="dialog" closable @close="detailVisible = false" aria-modal="true">
        <n-input v-model:value="detailKeyword" clearable placeholder="🔍 在这张盘点单里搜物品" style="margin-bottom: 8px" />
        <n-data-table
          :columns="[
            { key: 'item', title: '物品', render: (r: any) => r.item.name },
            { key: 'systemQuantity', title: '系统数量' },
            { key: 'countedQuantity', title: '盘点数量' },
            { key: 'diffQuantity', title: '差异', render: (r: any) => (r.diffQuantity > 0 ? `+${r.diffQuantity}` : r.diffQuantity) },
          ]"
          :data="detailRow.items.filter((r: any) => itemMatches(r.item, detailKeyword))"
          :row-key="(r: any) => r.id"
        />
        <template #footer>
          <n-space justify="end">
            <n-button @click="detailVisible = false">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
