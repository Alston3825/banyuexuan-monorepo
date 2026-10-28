<script setup lang="ts">
/**
 * 入库单：
 * ① 采购员“确认采购”后自动生成的入库单（待收货）——货按快递陆续到，客服每次到货“收货确认”：
 *    逐项填这次到了几个，确认即入库；没到齐就继续等，全部到齐自动完成；确实不来的货可“结束收货”并写原因。
 * ② 手工新建的入库单（临时入库）——仍按“提交 → 执行入库”。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInputNumber, NSelect, NInput, NRadio, NRadioGroup, NDescriptions, NDescriptionsItem, NEmpty, type DataTableColumns } from 'naive-ui'
import { goodsReceiptApi, purchaseOrderApi, warehouseApi, inventoryItemApi } from '../../api/modules/inventory.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import { useAuthStore } from '../../stores/auth'
import type { GoodsReceipt, GoodsReceiptItem, GoodsReceiptItemInput, PurchaseOrder, Warehouse, InventoryItem, SimilarItem } from '../../api/types/inventory'
import type { Store } from '../../api/types/store'
import ItemSelect from '../../components/inventory/ItemSelect.vue'
import LineListEditor from '../../components/inventory/LineListEditor.vue'
import { docMatches, itemMatches } from '../../utils/item-search'
import { renderStatusBadge, GOODS_RECEIPT_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useFormDraft } from '../../composables/useFormDraft'

const router = useRouter()
const auth = useAuthStore()
const canReceive = computed(() => auth.hasAccess('inventory.goods-receipt.receive'))
const canCreate = computed(() => auth.hasAccess('inventory.goods-receipt.create'))
const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-').slice(0, 16) : '-')

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const rows = ref<GoodsReceipt[]>([])
const stores = ref<Store[]>([])
const warehouses = ref<Warehouse[]>([])
const purchaseOrders = ref<PurchaseOrder[]>([])
const items = ref<InventoryItem[]>([])
const loading = ref(false)
const filterStatus = ref<string | null>(null)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const approvedPurchaseOrderOptions = computed(() => purchaseOrders.value.filter((p) => p.status === 'APPROVED').map((p) => ({ label: `${p.orderNo}（${p.supplier.name}）`, value: p.id })))
const statusOptions = Object.entries(GOODS_RECEIPT_STATUS_MAP).map(([value, m]) => ({ label: m.label, value }))
const keyword = ref('')
const shown = computed(() =>
  rows.value.filter((r) => (!filterStatus.value || r.status === filterStatus.value) && docMatches(keyword.value, [r.receiptNo, r.purchaseOrder?.orderNo, r.warehouse?.name, r.remark], r.items)),
)
// 入库单明细里按物品搜（一张单上物品多时快速定位）
const lineKeyword = ref('')
const detailLines = computed(() => (detail.value?.items ?? []).filter((l) => itemMatches(l.item, lineKeyword.value)))
const remaining = (l: GoodsReceiptItem) => Math.max(0, l.quantity - l.receivedQuantity)
const progressText = (r: GoodsReceipt) => {
  if (!r.tracked) return '-'
  const done = r.items.filter((i) => i.receivedQuantity >= i.quantity).length
  return `${done}/${r.items.length} 项到齐`
}

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
// 单据填到一半被刷新/闪退/误关：重新打开能恢复
const draft = useFormDraft('goods-receipt-create', model, (m) => m.items.length === 0 && !m.remark && !m.warehouseId && !m.purchaseOrderId, (m) => {
  itemRowKey = Math.max(itemRowKey, ...m.items.map((i) => i.key + 1), 0)
})

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
  draft.start()
}
function onPurchaseOrderChange(poId: string | null) {
  const po = purchaseOrders.value.find((p) => p.id === poId)
  if (po) {
    model.value.warehouseId = po.warehouseId
    model.value.items = po.items.map((i) => ({ key: itemRowKey++, itemId: i.itemId, quantity: i.quantity, unitCost: i.unitPrice / 100 }))
  }
}
function createItemRow() {
  return { key: itemRowKey++, itemId: '', quantity: 1, unitCost: 0 } as GoodsReceiptItemInput & { key: number }
}
/** 这一行改成“新物品”（物品库里没有）/ 改回选已有物品 */
function toNewItem(row: GoodsReceiptItemInput) {
  row.itemId = ''
  row.newItem = { name: '', spec: '', unit: '' }
}
function toExistingItem(row: GoodsReceiptItemInput) {
  row.newItem = undefined
}

// ---- 提交：新物品先和物品库查重，名称相近的弹窗让人核对（用已有 / 用已有改新名 / 作为新物品新增）----
interface SimilarCheck {
  rowKey: number
  name: string
  spec: string
  unit: string
  candidates: SimilarItem[]
  /** use:<物品id> | rename:<物品id> | new */
  choice: string
}
const similarVisible = ref(false)
const similarChecks = ref<SimilarCheck[]>([])
const exactMap = ref<Record<number, string>>({})

function validateRows(): string | null {
  if (!model.value.storeId || !model.value.warehouseId || model.value.items.length === 0) return '请完整填写门店/仓库，并至少添加一行入库明细'
  for (const [i, r] of model.value.items.entries()) {
    if (r.newItem) {
      if (!r.newItem.name.trim() || !r.newItem.unit.trim()) return `第 ${i + 1} 项是新物品，请填写名称和单位`
    } else if (!r.itemId) return `第 ${i + 1} 项请选择物品（物品库里没有的，点“新增物品”）`
  }
  return null
}

async function handleSubmit() {
  const err = validateRows()
  if (err) return void message.error(err)
  submitting.value = true
  try {
    const checks: SimilarCheck[] = []
    const exact: Record<number, string> = {}
    for (const r of model.value.items) {
      if (!r.newItem) continue
      const found = await inventoryItemApi.similar(r.newItem.name.trim(), r.newItem.spec?.trim())
      const hit = found.find((x) => x.exact)
      if (hit) {
        exact[r.key] = hit.id // 名称规格都一样：直接用已有的
        continue
      }
      if (found.length > 0) checks.push({ rowKey: r.key, name: r.newItem.name.trim(), spec: r.newItem.spec?.trim() ?? '', unit: r.newItem.unit.trim(), candidates: found.slice(0, 3), choice: `use:${found[0].id}` })
    }
    exactMap.value = exact
    if (checks.length > 0) {
      similarChecks.value = checks
      similarVisible.value = true
      return
    }
    await doCreate()
  } finally {
    submitting.value = false
  }
}

async function confirmSimilar() {
  similarVisible.value = false
  submitting.value = true
  try {
    await doCreate()
  } finally {
    submitting.value = false
  }
}

async function doCreate() {
  const decide = new Map(similarChecks.value.map((c) => [c.rowKey, c.choice]))
  const payloadItems: GoodsReceiptItemInput[] = model.value.items.map((r) => {
    const unitCost = Math.round((r.unitCost ?? 0) * 100) // 界面填“元”，接口按“分”
    if (!r.newItem) return { itemId: r.itemId, quantity: r.quantity, unitCost }
    if (exactMap.value[r.key]) return { itemId: exactMap.value[r.key], quantity: r.quantity, unitCost }
    const choice = decide.get(r.key) ?? 'new'
    if (choice.startsWith('use:')) return { itemId: choice.slice(4), quantity: r.quantity, unitCost }
    if (choice.startsWith('rename:')) return { itemId: choice.slice(7), renameItemTo: r.newItem.name.trim(), quantity: r.quantity, unitCost }
    return { newItem: { name: r.newItem.name.trim(), spec: r.newItem.spec?.trim() || undefined, unit: r.newItem.unit.trim() }, quantity: r.quantity, unitCost }
  })
  await goodsReceiptApi.create({
    storeId: model.value.storeId!,
    warehouseId: model.value.warehouseId!,
    purchaseOrderId: model.value.purchaseOrderId ?? undefined,
    remark: model.value.remark || undefined,
    items: payloadItems,
  })
  const added = payloadItems.filter((x) => x.newItem).length
  message.success(added ? `入库单已创建，${added} 个新物品已自动加入物品管理` : '入库单已创建')
  draft.clear()
  formVisible.value = false
  similarChecks.value = []
  await fetchAll()
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
  if (!instance) return void message.warning('未找到审批实例')
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

// ---------------- 详情 / 逐项收货确认 ----------------
const detail = ref<GoodsReceipt | null>(null)
const recvQty = ref<Record<string, number | null>>({})
const recvNote = ref<Record<string, string>>({})
const recvExpress = ref('')
const recvRemark = ref('')
const receiving = ref(false)
const isOpenTracked = computed(() => !!detail.value && detail.value.tracked && ['PENDING_RECEIPT', 'PARTIALLY_RECEIVED'].includes(detail.value.status))
const filled = computed(() => Object.values(recvQuantityClean()).filter((q) => q > 0).length)

function recvQuantityClean(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(recvQty.value)) if (v && v > 0) out[k] = v
  return out
}
async function openDetail(r: GoodsReceipt) {
  lineKeyword.value = ''
  detail.value = await goodsReceiptApi.get(r.id)
  resetRecv()
}
function resetRecv() {
  recvQty.value = {}
  recvNote.value = {}
  recvExpress.value = ''
  recvRemark.value = ''
}
function fillAll() {
  for (const l of detail.value?.items ?? []) recvQty.value[l.id] = remaining(l) > 0 ? remaining(l) : null
}
async function doReceive() {
  if (!detail.value) return
  const q = recvQuantityClean()
  const lines = Object.entries(q).map(([receiptItemId, quantity]) => ({ receiptItemId, quantity, note: recvNote.value[receiptItemId]?.trim() || undefined }))
  if (lines.length === 0) return void message.error('请在“这次到货”里填写到了几个（没到的留空）')
  const over = (detail.value.items ?? []).find((l) => (q[l.id] ?? 0) > remaining(l))
  if (over) return void message.error(`「${over.item.name}」最多还能收 ${remaining(over)}`)
  receiving.value = true
  try {
    const updated = await goodsReceiptApi.receive(detail.value.id, { lines, expressNo: recvExpress.value.trim() || undefined, note: recvRemark.value.trim() || undefined })
    detail.value = await goodsReceiptApi.get(updated.id)
    resetRecv()
    message.success(updated.status === 'COMPLETED' ? '全部到齐，已入库完成 ✓' : '这批货已确认并入库，还有没到的继续等')
    await fetchAll()
  } finally {
    receiving.value = false
  }
}
const shortVisible = ref(false)
const shortReason = ref('')
async function doCloseShort() {
  if (!detail.value) return
  if (!shortReason.value.trim()) return void message.error('请写明未到货的原因')
  await goodsReceiptApi.closeShort(detail.value.id, shortReason.value.trim())
  shortVisible.value = false
  detail.value = await goodsReceiptApi.get(detail.value.id)
  message.success('已结束收货')
  await fetchAll()
}
const lineName = (id: string) => detail.value?.items.find((i) => i.id === id)?.item.name ?? ''

function actionButtons(row: GoodsReceipt): VNode[] {
  const b: VNode[] = []
  if (row.tracked) {
    if (['PENDING_RECEIPT', 'PARTIALLY_RECEIVED'].includes(row.status) && canReceive.value) b.push(h(NButton, { size: 'small', type: 'primary', onClick: () => openDetail(row) }, { default: () => '收货确认' }))
  } else if (row.status === 'DRAFT') {
    b.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitReceipt(row) }, { default: () => '提交' }))
    b.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
  } else if (row.status === 'PENDING_APPROVAL') {
    b.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '审批进度' }))
    b.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
  } else if (row.status === 'APPROVED') {
    b.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleExecute(row) }, { default: () => '执行入库' }))
    b.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
  }
  b.push(h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => '详情' }))
  return b
}

const columns: DataTableColumns<GoodsReceipt> = [
  { key: 'receiptNo', title: '入库单号', width: 170, render: (r) => h('a', { style: 'cursor:pointer;color:#2080f0', onClick: () => openDetail(r) }, r.receiptNo) },
  { key: 'warehouse', title: '仓库', width: 120, render: (r) => r.warehouse.name },
  { key: 'purchaseOrder', title: '关联采购单', width: 160, render: (r) => r.purchaseOrder?.orderNo ?? '无(临时入库)' },
  { key: 'status', title: '状态', width: 120, render: (r) => renderStatusBadge(r.status, GOODS_RECEIPT_STATUS_MAP) },
  { key: 'progress', title: '到货进度', width: 110, render: (r) => progressText(r) },
  { key: 'createdAt', title: '创建时间', width: 140, render: (r) => dt(r.createdAt) },
  { key: 'actions', title: '操作', width: 220, fixed: 'right', render: (r) => h(NSpace, { size: 6 }, { default: () => actionButtons(r) }) },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" align="center">
      <n-space align="center" :wrap="true">
        <n-input v-model:value="keyword" clearable placeholder="🔍 搜索：入库单号 / 采购单号 / 物品名称（支持拼音首字母）/ 仓库" style="width: min(400px, 94vw)" />
        <n-select v-model:value="filterStatus" :options="statusOptions" clearable placeholder="全部状态" style="width: 150px" />
      </n-space>
      <n-button v-if="canCreate" @click="openCreateModal">手工新建入库单（临时入库）</n-button>
    </n-space>

    <template v-if="isMobile">
      <n-empty v-if="!loading && shown.length === 0" description="没有入库单" />
      <div v-for="r in shown" :key="r.id" class="gr-card" @click="openDetail(r)">
        <div class="gr-top"><b>{{ r.receiptNo }}</b><component :is="() => renderStatusBadge(r.status, GOODS_RECEIPT_STATUS_MAP)" /></div>
        <div class="gr-line">{{ r.purchaseOrder?.orderNo ?? '临时入库' }} · {{ r.warehouse.name }}<template v-if="r.tracked"> · {{ progressText(r) }}</template></div>
        <n-space v-if="r.tracked && ['PENDING_RECEIPT', 'PARTIALLY_RECEIVED'].includes(r.status) && canReceive" style="margin-top: 6px" @click.stop>
          <n-button size="small" type="primary" @click="openDetail(r)">收货确认</n-button>
        </n-space>
      </div>
    </template>
    <n-data-table v-else :columns="columns" :data="shown" :loading="loading" :row-key="(r: GoodsReceipt) => r.id" :scroll-x="1100" />

    <!-- 详情 / 收货确认 -->
    <n-modal :mask-closable="false" :show="!!detail" @update:show="(v) => !v && (detail = null)">
      <n-card v-if="detail" :title="`入库单 ${detail.receiptNo}`" style="width: min(900px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <template #header-extra><component :is="() => renderStatusBadge(detail!.status, GOODS_RECEIPT_STATUS_MAP)" /></template>
        <n-descriptions :column="isMobile ? 1 : 3" label-placement="left" size="small" bordered style="margin-bottom: 10px">
          <n-descriptions-item label="仓库">{{ detail.warehouse.name }}</n-descriptions-item>
          <n-descriptions-item label="关联采购单">{{ detail.purchaseOrder?.orderNo ?? '无(临时入库)' }}</n-descriptions-item>
          <n-descriptions-item label="创建时间">{{ dt(detail.createdAt) }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.purchaseOrder?.expressNo" label="采购运单号">{{ detail.purchaseOrder.expressNo }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.completedAt" label="完成时间">{{ dt(detail.completedAt) }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.shortClosedNote" label="结束收货原因" :span="3">{{ detail.shortClosedNote }}</n-descriptions-item>
        </n-descriptions>

        <template v-if="detail.tracked">
          <div v-if="isOpenTracked && canReceive" class="gr-hint">
            快递到了就在“这次到货”里填写到了几个（没到的留空），再点“确认收货并入库”。可以分多次，货品陆续到也没关系。
            <n-button size="tiny" style="margin-left: 8px" @click="fillAll">全部填成剩余数量</n-button>
          </div>
          <n-input v-if="detail.items.length > 6" v-model:value="lineKeyword" clearable placeholder="🔍 在这张入库单里搜物品（名称 / 拼音首字母）" style="margin-bottom: 8px" />
          <div class="gr-lines">
            <div v-for="l in detailLines" :key="l.id" class="gr-lrow" :class="{ 'gr-done': remaining(l) === 0 }">
              <div class="gr-lname">
                <b>{{ l.item.name }}</b><span v-if="l.item.spec" class="gr-sub"> {{ l.item.spec }}</span>
                <div class="gr-sub">采购 {{ l.quantity }} {{ l.item.unit }} · 已到 {{ l.receivedQuantity }} · <span :style="remaining(l) ? 'color:#d9822b' : 'color:#18a058'">{{ remaining(l) ? `还差 ${remaining(l)}` : '已到齐 ✓' }}</span></div>
              </div>
              <div v-if="isOpenTracked && canReceive && remaining(l) > 0" class="gr-input">
                <n-input-number v-model:value="recvQty[l.id]" :min="0" :max="remaining(l)" :precision="0" placeholder="这次到货" size="small" style="width: 120px" />
                <n-input v-model:value="recvNote[l.id]" placeholder="备注（如包装破损）" size="small" style="width: 170px" />
              </div>
            </div>
          </div>
          <n-form v-if="isOpenTracked && canReceive" label-placement="top" size="small" style="margin-top: 8px">
            <n-form-item label="这批货的快递单号（选填）"><n-input v-model:value="recvExpress" /></n-form-item>
            <n-form-item label="备注（选填）"><n-input v-model:value="recvRemark" /></n-form-item>
          </n-form>

          <div v-if="detail.confirmations?.length" style="margin-top: 12px">
            <div class="gr-sec">收货记录（{{ detail.confirmations.length }} 次）</div>
            <div v-for="c in detail.confirmations" :key="c.id" class="gr-rec">
              <div><b>{{ dt(c.confirmedAt) }}</b> · {{ c.confirmedByName || '' }} 确认<span v-if="c.expressNo"> · 快递 {{ c.expressNo }}</span><span v-if="c.note"> · {{ c.note }}</span></div>
              <div class="gr-sub">{{ c.lines.map((x) => `${lineName(x.goodsReceiptItemId)} ×${x.quantity}${x.note ? `（${x.note}）` : ''}`).join('；') }}</div>
            </div>
          </div>
        </template>
        <template v-else>
          <n-input v-if="detail.items.length > 6" v-model:value="lineKeyword" clearable placeholder="🔍 在这张入库单里搜物品（名称 / 拼音首字母）" style="margin-bottom: 8px" />
          <table class="gr-table">
            <thead><tr><th>物品</th><th>数量</th><th>单位成本（元）</th></tr></thead>
            <tbody><tr v-for="l in detailLines" :key="l.id"><td>{{ l.item.name }}</td><td>{{ l.quantity }} {{ l.item.unit }}</td><td>{{ (l.unitCost / 100).toFixed(2) }}</td></tr></tbody>
          </table>
        </template>

        <template #footer>
          <n-space justify="end">
            <n-button v-if="detail.tracked && detail.status === 'PARTIALLY_RECEIVED' && canReceive" quaternary type="warning" @click="(shortReason = ''), (shortVisible = true)">剩下的不来了，结束收货</n-button>
            <n-button v-if="isOpenTracked && canReceive" type="primary" :loading="receiving" :disabled="filled === 0" @click="doReceive">确认收货并入库（{{ filled }} 项）</n-button>
            <n-button @click="detail = null">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :mask-closable="false" :show="shortVisible" @update:show="(v) => (shortVisible = v)">
      <n-card title="结束收货" style="width: min(440px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <p class="gr-hint" style="margin-top: 0">没到的货不会再入库，入库单和采购单都会标记完成。请写明原因，留作记录。</p>
        <n-input v-model:value="shortReason" type="textarea" placeholder="如：供应商缺货，已退款" :autosize="{ minRows: 2 }" />
        <template #footer>
          <n-space justify="end"><n-button @click="shortVisible = false">再等等</n-button><n-button type="warning" @click="doCloseShort">确认结束</n-button></n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 手工新建 -->
    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="手工新建入库单（临时入库）" style="width: min(820px, 96vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="关联采购单">
            <n-select v-model:value="model.purchaseOrderId" :options="approvedPurchaseOrderOptions" clearable placeholder="不选=临时入库，按仓库配置决定是否需要审批" @update:value="onPurchaseOrderChange" />
          </n-form-item>
          <n-form-item label="入库仓库"><n-select v-model:value="model.warehouseId" :options="warehouseOptions" :disabled="!!model.purchaseOrderId" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" /></n-form-item>
          <n-form-item label="入库明细">
            <line-list-editor v-model="model.items" :on-create="createItemRow" add-text="添加一个入库物品" #="{ value }">
              <n-space :wrap="true" :size="[8, 4]" align="center" style="width: 100%">
                <template v-if="value.newItem">
                  <n-input v-model:value="value.newItem.name" placeholder="新物品名称" style="width: min(200px, 94vw)" />
                  <n-input v-model:value="value.newItem.spec" placeholder="规格（选填）" style="width: min(140px, 94vw)" />
                  <n-input v-model:value="value.newItem.unit" placeholder="单位，如 箱" style="width: min(110px, 94vw)" />
                  <n-button text type="primary" @click="toExistingItem(value)">改选已有物品</n-button>
                </template>
                <template v-else>
                  <item-select v-model="value.itemId" :items="items" style="width: min(320px, 94vw)" />
                  <n-button text type="primary" @click="toNewItem(value)">物品库里没有？新增物品</n-button>
                </template>
                <n-input-number v-model:value="value.quantity" :min="1" :precision="0" placeholder="数量" style="width: min(150px, 94vw)">
                  <template #prefix>数量</template>
                  <template #suffix>{{ value.newItem ? value.newItem.unit : (items.find((i) => i.id === value.itemId)?.unit ?? '') }}</template>
                </n-input-number>
                <n-input-number v-model:value="value.unitCost" :min="0" :show-button="false" placeholder="0" style="width: min(190px, 94vw)">
                  <template #prefix>单位成本</template>
                  <template #suffix>元</template>
                </n-input-number>
              </n-space>
            </line-list-editor>
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

    <!-- 新物品和已有物品名称相近：人工核对 -->
    <n-modal :mask-closable="false" :show="similarVisible" @update:show="(v) => (similarVisible = v)">
      <n-card title="发现名称相近的物品，请核对" style="width: min(640px, 96vw); max-height: 90vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <p class="gr-hint" style="margin-top: 0">下面这些新物品，物品管理里已经有名字很像的。请逐个选择：是同一种东西就用已有的（避免重复），确实是新东西再单独新增。</p>
        <div v-for="c in similarChecks" :key="c.rowKey" class="sim-card">
          <div class="sim-title">新物品：<b>{{ c.name }}</b><span v-if="c.spec"> · {{ c.spec }}</span> · {{ c.unit }}</div>
          <n-radio-group v-model:value="c.choice" vertical>
            <template v-for="cand in c.candidates" :key="cand.id">
              <n-radio :value="'use:' + cand.id">合并：用已有物品「{{ cand.name }}{{ cand.spec ? ' ' + cand.spec : '' }}」（{{ cand.code }}，单位 {{ cand.unit }}），名称保持原来的</n-radio>
              <n-radio v-if="cand.name !== c.name" :value="'rename:' + cand.id">合并并改名：用已有物品「{{ cand.name }}」，同时把名称改成新名称「{{ c.name }}」</n-radio>
            </template>
            <n-radio value="new">不是同一种：作为新物品「{{ c.name }}」单独新增</n-radio>
          </n-radio-group>
        </div>
        <template #footer>
          <n-space justify="end">
            <n-button @click="similarVisible = false">返回修改</n-button>
            <n-button type="primary" :loading="submitting" @click="confirmSimilar">按以上选择创建入库单</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.sim-card {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fcfcfc;
}
.sim-title {
  margin-bottom: 6px;
}
.gr-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.gr-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.gr-line {
  margin-top: 4px;
  color: #555;
  font-size: 12px;
}
.gr-hint {
  margin: 8px 0;
  padding: 6px 10px;
  background: #faf6f0;
  border-radius: 6px;
  color: #8a5a22;
  font-size: 12px;
  line-height: 1.8;
}
.gr-lines {
  border: 1px solid #eee;
  border-radius: 8px;
}
.gr-lrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #f3f3f3;
}
.gr-lrow:last-child {
  border-bottom: none;
}
.gr-done {
  background: #f6fbf7;
}
.gr-sub {
  color: #888;
  font-size: 12px;
}
.gr-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gr-sec {
  margin-bottom: 6px;
  padding-left: 8px;
  border-left: 3px solid #d9822b;
  font-weight: 600;
  font-size: 13px;
}
.gr-rec {
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
  font-size: 13px;
}
.gr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.gr-table th,
.gr-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
}
</style>
