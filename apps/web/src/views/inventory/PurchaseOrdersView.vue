<script setup lang="ts">
/**
 * 采购单：店长批准的申购单生成的采购单直接是“待采购”（不再审批），采购员采购完点“确认采购”，
 * 系统自动生成待收货的入库单，之后由客服按快递到货情况逐项确认收货。手工新建的采购单仍走审批。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NSelect, NInput, NDescriptions, NDescriptionsItem, NEmpty, type DataTableColumns } from 'naive-ui'
import { purchaseOrderApi, supplierApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import { docMatches, itemMatches } from '../../utils/item-search'
import ItemLinesEditor, { type ItemLine } from '../../components/inventory/ItemLinesEditor.vue'
import Import1688Modal from '../../components/inventory/Import1688Modal.vue'
import PurchaseShipmentsPanel from '../../components/inventory/PurchaseShipmentsPanel.vue'
import PurchaseLogisticsPanel from '../../components/inventory/PurchaseLogisticsPanel.vue'
import { useAuthStore } from '../../stores/auth'
import type { PurchaseOrder, PurchaseOrderItemInput, Supplier, Warehouse, InventoryItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, PURCHASE_ORDER_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useFormDraft } from '../../composables/useFormDraft'

const router = useRouter()
const auth = useAuthStore()
const canPurchase = computed(() => auth.hasAccess('inventory.purchase-order.purchase'))
const canCreate = computed(() => auth.hasAccess('inventory.purchase-order.create'))
const yuan = (cents: number) => (cents / 100).toFixed(2)
const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-').slice(0, 16) : '-')

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const rows = ref<PurchaseOrder[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const suppliers = ref<Supplier[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)
const filterStatus = ref<string | null>(null)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const supplierOptions = computed(() => suppliers.value.map((s) => ({ label: s.name, value: s.id })))
const statusOptions = Object.entries(PURCHASE_ORDER_STATUS_MAP).map(([value, m]) => ({ label: m.label, value }))
const keyword = ref('')
const shown = computed(() =>
  rows.value.filter((r) => (!filterStatus.value || r.status === filterStatus.value) && docMatches(keyword.value, [r.orderNo, r.supplier?.name, r.warehouse?.name, r.expressNo, r.remark], r.items)),
)
// 采购单详情里按物品搜
const lineKeyword = ref('')
const detailLines = computed(() => (detail.value?.items ?? []).filter((i) => itemMatches(i.item, lineKeyword.value)))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({
  storeId: null as string | null,
  warehouseId: null as string | null,
  supplierId: null as string | null,
  remark: '',
  items: [] as ItemLine[],
  createMissing: true,
})

// 采购单填到一半被刷新/闪退/误关：重新打开能恢复
const draft = useFormDraft('purchase-order-create', model, (m) => m.items.length === 0 && !m.remark && !m.supplierId && !m.warehouseId)

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
  model.value = { storeId: stores.value[0]?.id ?? null, warehouseId: null, supplierId: null, remark: '', items: [], createMissing: true }
  formVisible.value = true
  draft.start()
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.warehouseId || !model.value.supplierId || model.value.items.length === 0) {
    message.error('请完整填写门店/仓库/供应商，并至少添加一行采购明细')
    return
  }
  for (const l of model.value.items) {
    if (!l.name.trim()) return void message.error('有一行新物品还没填名称')
    if (!l.quantity || l.quantity < 1) return void message.error(`「${l.name}」请填写数量`)
    if (!l.itemId && !l.unit.trim()) return void message.error(`新物品「${l.name}」请填写单位（会同时加入物品库）`)
  }
  submitting.value = true
  try {
    await purchaseOrderApi.create({
      storeId: model.value.storeId,
      warehouseId: model.value.warehouseId,
      supplierId: model.value.supplierId,
      remark: model.value.remark || undefined,
      // 单价界面上填“元”，接口按“分”存
      items: model.value.items.map((l): PurchaseOrderItemInput => ({
        ...(l.itemId ? { itemId: l.itemId } : { newItem: { name: l.name.trim(), spec: l.spec.trim() || undefined, brand: l.brand.trim() || undefined, unit: l.unit.trim() } }),
        quantity: l.quantity!,
        unitPrice: Math.round((l.unitPrice ?? 0) * 100),
      })),
    })
    message.success('采购单已创建')
    draft.clear()
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
  if (!instance) return void message.warning('未找到审批实例')
  router.push(`/workflow/instances/${instance.id}`)
}

// ---------------- 确认采购 ----------------
const buyTarget = ref<PurchaseOrder | null>(null)
const buyModel = ref({ expressNo: '', note: '' })
const buying = ref(false)
function openBuy(row: PurchaseOrder) {
  buyTarget.value = row
  buyModel.value = { expressNo: '', note: '' }
}
async function doBuy() {
  if (!buyTarget.value) return
  buying.value = true
  try {
    const res = await purchaseOrderApi.confirmPurchase(buyTarget.value.id, { version: buyTarget.value.version, expressNo: buyModel.value.expressNo.trim() || undefined, note: buyModel.value.note.trim() || undefined })
    buyTarget.value = null
    detail.value = null
    dialog.success({ title: '已确认采购', content: `系统已自动生成入库单 ${res.receipt.receiptNo}（待收货）。快递到货后，客服到“入库单”里逐项确认收货，货品陆续到也没关系。`, positiveText: '知道了' })
    await fetchAll()
  } finally {
    buying.value = false
  }
}

// ---------------- 取消 ----------------
const cancelTarget = ref<PurchaseOrder | null>(null)
const cancelReason = ref('')
function openCancel(row: PurchaseOrder) {
  cancelTarget.value = row
  cancelReason.value = ''
}
async function doCancel() {
  if (!cancelTarget.value) return
  if (!cancelReason.value.trim()) return void message.error('请填写取消原因')
  await purchaseOrderApi.cancel(cancelTarget.value.id, cancelReason.value.trim(), cancelTarget.value.version)
  cancelTarget.value = null
  detail.value = null
  message.success('采购单已取消')
  await fetchAll()
}

// ---------------- 详情 ----------------
const detail = ref<PurchaseOrder | null>(null)
watch(detail, () => (lineKeyword.value = ''))
const receiptOf = (o: PurchaseOrder) => o.goodsReceipts?.find((g) => g.tracked) ?? o.goodsReceipts?.[0] ?? null
const canCancel = (o: PurchaseOrder) => ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PURCHASED'].includes(o.status)

function actionButtons(row: PurchaseOrder): VNode[] {
  const b: VNode[] = []
  if (row.status === 'APPROVED' && canPurchase.value) b.push(h(NButton, { size: 'small', type: 'primary', onClick: () => openBuy(row) }, { default: () => '确认采购' }))
  if (row.status === 'DRAFT') b.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitOrder(row) }, { default: () => '提交审核' }))
  if (row.status === 'PENDING_APPROVAL') b.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '审批进度' }))
  b.push(h(NButton, { size: 'small', onClick: () => (detail.value = row) }, { default: () => '详情' }))
  return b
}

/** 采购单下有多笔 1688 订单时，列表显示“已签收 x/总数” */
const shipSummary = (r: PurchaseOrder) => {
  const sh = (r.shipments ?? []).filter((x) => x.expressNo)
  if (!sh.length) return `${r.shipments?.length ?? 0}笔未发货`
  return `签收 ${sh.filter((x) => x.logisticsState === 3).length}/${sh.length}`
}
const LOGISTICS_LABEL: Record<number, string> = { [-1]: '暂无信息', 0: '运输中', 1: '已揽收', 2: '疑难件', 3: '已签收', 4: '已退签', 5: '派件中', 6: '退回中', 7: '转投中', 8: '清关中', 14: '已拒签' }
const columns: DataTableColumns<PurchaseOrder> = [
  { key: 'orderNo', title: '采购单号', width: 170, render: (r) => h('a', { style: 'cursor:pointer;color:#2080f0', onClick: () => (detail.value = r) }, r.orderNo) },
  { key: 'supplier', title: '供应商', width: 140, render: (r) => r.supplier.name },
  { key: 'warehouse', title: '入库仓库', width: 120, render: (r) => r.warehouse.name },
  { key: 'totalAmount', title: '金额（元）', width: 100, render: (r) => yuan(r.totalAmount) },
  { key: 'status', title: '状态', width: 130, render: (r) => renderStatusBadge(r.status, PURCHASE_ORDER_STATUS_MAP) },
  { key: 'logistics', title: '物流', width: 90, render: (r) => (r.shipments?.length ? shipSummary(r) : r.logisticsState === null || r.logisticsState === undefined ? (r.expressNo ? '已登记' : '-') : LOGISTICS_LABEL[r.logisticsState] ?? '运输中') },
  { key: 'purchasedAt', title: '采购时间', width: 140, render: (r) => dt(r.purchasedAt) },
  { key: 'createdAt', title: '创建时间', width: 140, render: (r) => dt(r.createdAt) },
  { key: 'actions', title: '操作', width: 200, fixed: 'right', render: (r) => h(NSpace, { size: 6 }, { default: () => actionButtons(r) }) },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" align="center">
      <n-space align="center" :wrap="true">
        <n-input v-model:value="keyword" clearable placeholder="🔍 搜索：采购单号 / 供应商 / 物品名称（支持拼音首字母）/ 运单号" style="width: min(400px, 94vw)" />
        <n-select v-model:value="filterStatus" :options="statusOptions" clearable placeholder="全部状态" style="width: 150px" />
      </n-space>
      <n-space :wrap="true">
        <Import1688Modal v-if="canPurchase" @done="fetchAll" />
        <n-button v-if="canCreate" type="primary" @click="openCreateModal">手工新建采购单（需审批）</n-button>
      </n-space>
    </n-space>

    <template v-if="isMobile">
      <n-empty v-if="!loading && shown.length === 0" description="没有采购单" />
      <div v-for="r in shown" :key="r.id" class="po-card" @click="detail = r">
        <div class="po-top"><b>{{ r.orderNo }}</b><component :is="() => renderStatusBadge(r.status, PURCHASE_ORDER_STATUS_MAP)" /></div>
        <div class="po-line">{{ r.supplier.name }} · {{ r.warehouse.name }} · <b>{{ yuan(r.totalAmount) }} 元</b></div>
        <div v-if="r.shipments?.length" class="po-line">🚚 {{ shipSummary(r) }}（{{ r.shipments.length }} 笔 1688 订单）</div>
        <div v-else-if="r.logisticsState !== null && r.logisticsState !== undefined" class="po-line">🚚 {{ LOGISTICS_LABEL[r.logisticsState] ?? '运输中' }}</div>
        <n-space v-if="r.status === 'APPROVED' && canPurchase" style="margin-top: 6px" @click.stop>
          <n-button size="small" type="primary" @click="openBuy(r)">确认采购</n-button>
        </n-space>
      </div>
    </template>
    <n-data-table v-else :columns="columns" :data="shown" :loading="loading" :row-key="(r: PurchaseOrder) => r.id" :scroll-x="1100" />

    <!-- 详情 -->
    <n-modal :show="!!detail" @update:show="(v) => !v && (detail = null)">
      <n-card v-if="detail" :title="`采购单 ${detail.orderNo}`" style="width: min(760px, 96vw); max-height: 92vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <template #header-extra><component :is="() => renderStatusBadge(detail!.status, PURCHASE_ORDER_STATUS_MAP)" /></template>
        <n-descriptions :column="isMobile ? 1 : 2" label-placement="left" size="small" bordered style="margin-bottom: 10px">
          <n-descriptions-item label="供应商">{{ detail.supplier.name }}</n-descriptions-item>
          <n-descriptions-item label="入库仓库">{{ detail.warehouse.name }}</n-descriptions-item>
          <n-descriptions-item label="合计金额"><b>{{ yuan(detail.totalAmount) }} 元</b></n-descriptions-item>
          <n-descriptions-item label="创建时间">{{ dt(detail.createdAt) }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.purchasedAt" label="采购确认时间">{{ dt(detail.purchasedAt) }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.expressNo" label="运单号">{{ detail.expressNo }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.purchaseNote" label="采购备注" :span="2">{{ detail.purchaseNote }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.remark" label="备注" :span="2">{{ detail.remark }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.cancelReason" label="取消原因" :span="2">{{ detail.cancelReason }}</n-descriptions-item>
          <n-descriptions-item v-if="receiptOf(detail)" label="入库单" :span="2"><a style="cursor: pointer; color: #2080f0" @click="router.push('/inventory/goods-receipts')">{{ receiptOf(detail)!.receiptNo }}（去入库单页面收货）</a></n-descriptions-item>
        </n-descriptions>
        <PurchaseShipmentsPanel v-if="detail.status !== 'DRAFT' && detail.status !== 'CANCELLED'" :order-id="detail.id" @changed="fetchAll" />
        <PurchaseLogisticsPanel v-if="detail.status !== 'DRAFT' && detail.status !== 'CANCELLED'" :order-id="detail.id" :can-edit="canPurchase" @changed="fetchAll" />
        <n-input v-if="detail.items.length > 6" v-model:value="lineKeyword" clearable placeholder="🔍 在这张采购单里搜物品（名称 / 拼音首字母）" style="margin-bottom: 8px" />
        <table class="po-table">
          <thead><tr><th>物品</th><th>规格</th><th>数量</th><th>单价（元）</th><th>小计（元）</th></tr></thead>
          <tbody>
            <tr v-for="i in detailLines" :key="i.id"><td>{{ i.item.name }}</td><td>{{ i.item.spec ?? '-' }}</td><td>{{ i.quantity }} {{ i.item.unit }}</td><td>{{ yuan(i.unitPrice) }}</td><td>{{ yuan(i.subtotal) }}</td></tr>
          </tbody>
        </table>
        <div v-if="detail.status === 'APPROVED'" class="po-hint">这张采购单已经是“待采购”：由店长批准的申购单生成，不需要再审批。采购完成后点“确认采购”。</div>
        <template #footer>
          <n-space justify="end">
            <n-button v-if="canCancel(detail) && (detail.status !== 'APPROVED' || canPurchase || canCreate)" quaternary type="error" @click="openCancel(detail)">取消采购单</n-button>
            <n-button v-if="detail.status === 'APPROVED' && canPurchase" type="primary" @click="openBuy(detail)">确认采购</n-button>
            <n-button @click="detail = null">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 确认采购 -->
    <n-modal :mask-closable="false" :show="!!buyTarget" @update:show="(v) => !v && (buyTarget = null)">
      <n-card v-if="buyTarget" :title="`确认采购：${buyTarget.orderNo}`" style="width: min(460px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <p class="po-hint" style="margin-top: 0">点“确认采购”表示东西已经买好、在路上。系统会自动生成待收货的入库单，客服收到快递后逐项确认。</p>
        <n-form label-placement="top" size="small">
          <n-form-item label="快递/运单号（选填，有多个可以都写上）"><n-input v-model:value="buyModel.expressNo" /></n-form-item>
          <n-form-item label="备注（选填，如在哪里买的、预计几号到）"><n-input v-model:value="buyModel.note" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="buyTarget = null">取消</n-button>
            <n-button type="primary" :loading="buying" @click="doBuy">确认已采购</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 取消 -->
    <n-modal :mask-closable="false" :show="!!cancelTarget" @update:show="(v) => !v && (cancelTarget = null)">
      <n-card title="取消采购单" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-input v-model:value="cancelReason" type="textarea" placeholder="请填写取消原因" :autosize="{ minRows: 2 }" />
        <template #footer>
          <n-space justify="end"><n-button @click="cancelTarget = null">不取消</n-button><n-button type="error" @click="doCancel">确认取消</n-button></n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 手工新建 -->
    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="手工新建采购单（需审批）" style="width: min(860px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="入库仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" /></n-form-item>
          <n-form-item label="供应商"><n-select v-model:value="model.supplierId" :options="supplierOptions" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="采购明细">
            <div style="width: 100%">
              <item-lines-editor v-model="model.items" :show-purpose="false" />
              <div style="margin-top: 6px; color: #888; font-size: 12px">没采购过的新物品会自动加入物品库，下次直接搜得到；单价不填按 0 元，之后在采购时再核对。</div>
            </div>
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">创建</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.po-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.po-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.po-line {
  margin-top: 4px;
  color: #555;
  font-size: 12px;
}
.po-hint {
  margin: 10px 0;
  padding: 6px 10px;
  background: #faf6f0;
  border-radius: 6px;
  color: #8a5a22;
  font-size: 12px;
  line-height: 1.7;
}
.po-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.po-table th,
.po-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
}
.po-table th {
  color: #888;
  font-weight: 500;
}
</style>
