<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NDynamicInput, NAlert, type DataTableColumns } from 'naive-ui'
import { stockIssueApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import ItemSelect from '../../components/inventory/ItemSelect.vue'
import { useWarehouseStockMap } from '../../composables/useWarehouseStockMap'
import { docMatches } from '../../utils/item-search'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { StockIssue, StockIssueItemInput, StockIssueType, Warehouse, InventoryItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, INVENTORY_DOC_STATUS_MAP, STOCK_ISSUE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useFormDraft } from '../../composables/useFormDraft'

const router = useRouter()
const ISSUE_TYPE_OPTIONS = Object.entries(STOCK_ISSUE_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))

const rows = ref<StockIssue[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const keyword = ref('')
const shown = computed(() => rows.value.filter((r) => docMatches(keyword.value, [r.issueNo, r.warehouse?.name, r.remark], r.items)))

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
// 单据填到一半被刷新/闪退/误关：重新打开能恢复
const draft = useFormDraft('stock-issue-create', model, (m) => m.items.length === 0 && !m.remark && !m.warehouseId, (m) => {
  itemRowKey = Math.max(itemRowKey, ...m.items.map((i) => i.key + 1), 0)
})

// 选了仓库后取这个仓库每种物品的现有库存：下拉里和每一行都显示，领用数量超过库存就拦住
const warehouseRef = computed(() => model.value.warehouseId)
const { stock, loaded: stockLoaded, loading: stockLoading, stockOf, overOf } = useWarehouseStockMap(warehouseRef)
const overItems = computed(() => overOf(model.value.items))
const itemName = (id: string) => items.value.find((i) => i.id === id)?.name ?? '该物品'
const unitOf = (id: string) => items.value.find((i) => i.id === id)?.unit ?? ''
const rowOver = (r: { itemId: string }) => !!r.itemId && overItems.value.some((o) => o.id === r.itemId)

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
  draft.start()
}

function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1 }
}

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
    draft.clear()
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
    <n-space justify="space-between" align="center" style="margin-bottom: 12px" :wrap="true">
      <n-input v-model:value="keyword" clearable placeholder="🔍 搜索：单号 / 物品名称（支持拼音首字母）/ 仓库" style="width: min(360px, 94vw)" />
      <n-button type="primary" @click="openCreateModal">新建出库/领用单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="shown" :loading="loading" :row-key="(r: StockIssue) => r.id" :scroll-x="1000" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建出库/领用单" style="width: min(820px, 96vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
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
                  <item-select v-model="value.itemId" :items="items" :stock="stockLoaded ? stock : null" style="width: min(280px, 94vw)" />
                  <n-input-number v-model:value="value.quantity" :min="1" :precision="0" :status="rowOver(value) ? 'error' : undefined" placeholder="数量" style="width: min(120px, 94vw)" />
                  <!-- 现有库存：选了物品就一直显示（0 也显示）；还没选仓库时提示先选仓库 -->
                  <span v-if="value.itemId" class="stock-hint" :class="{ 'stock-bad': stockLoaded && rowOver(value), 'stock-ok': stockLoaded && !rowOver(value) }">
                    <template v-if="!model.warehouseId">选好仓库后显示现有库存</template>
                    <template v-else-if="stockLoading">库存查询中…</template>
                    <template v-else-if="stockLoaded">现有库存 <b>{{ stockOf(value.itemId) }}</b> {{ unitOf(value.itemId) }}<template v-if="rowOver(value)">，库存不足</template></template>
                    <template v-else>暂时查不到库存</template>
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

<style scoped>
.stock-hint {
  white-space: nowrap;
  font-size: 13px;
  color: #86817a;
}
.stock-ok {
  color: #5f6b49;
}
.stock-bad {
  color: #b4533a;
}
</style>
