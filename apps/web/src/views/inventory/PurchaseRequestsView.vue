<script setup lang="ts">
/**
 * 申购单：把每月的《申购表》Excel 直接导入成系统里的申购单 → 提交审批 → 批准后选供应商和仓库生成采购单。
 * 表里的 申请部门/申请人/物品/规格/品牌/数量/单位/单价/用途 都会保留，金额按“数量×单价”重新核算并和表里的合计对账。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NTag, NAlert, NCheckbox, NDatePicker, NEmpty, NDescriptions, NDescriptionsItem,
  type DataTableColumns,
} from 'naive-ui'
import { inventoryItemApi, purchaseRequestApi, supplierApi, warehouseApi } from '../../api/modules/inventory.api'
import { storeApi } from '../../api/modules/store.api'
import type {
  InventoryItem, PurchaseRequest, PurchaseRequestItem, PurchaseRequestStatus, RequestImportPreview, RequestImportPreviewRow, Supplier, Warehouse,
} from '../../api/types/inventory'
import { renderStatusBadge, PURCHASE_REQUEST_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const money = (v: string | number | null | undefined) => (v === null || v === undefined ? '-' : (Math.round(Number(v) * 100) / 100).toFixed(2))
const price = (v: string | number | null | undefined) => (v === null || v === undefined ? '待询价' : String(Number(v)))
const day = (iso: string) => iso.slice(0, 10)

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

// ---------------- 列表 ----------------
const rows = ref<PurchaseRequest[]>([])
const loading = ref(false)
const stores = ref<{ label: string; value: string }[]>([])
const filterStore = ref<string | null>(null)
const filterStatus = ref<PurchaseRequestStatus | null>(null)
const statusOptions = Object.entries(PURCHASE_REQUEST_STATUS_MAP).map(([value, m]) => ({ label: m.label, value }))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await purchaseRequestApi.list({ storeId: filterStore.value ?? undefined, status: filterStatus.value ?? undefined })
  } finally {
    loading.value = false
  }
}
watch([filterStore, filterStatus], fetchList)

const columns: DataTableColumns<PurchaseRequest> = [
  { key: 'requestNo', title: '申购单号', width: 170, render: (r) => h('a', { style: 'cursor:pointer;color:#2080f0', onClick: () => openDetail(r.id) }, r.requestNo) },
  { key: 'requestDate', title: '申购日期', width: 110, render: (r) => day(r.requestDate) },
  { key: 'store', title: '门店', width: 130, render: (r) => r.store.name },
  { key: 'status', title: '状态', width: 150, render: (r) => renderStatusBadge(r.status, PURCHASE_REQUEST_STATUS_MAP) },
  { key: 'count', title: '物品数', width: 80, render: (r) => r._count?.items ?? '-' },
  { key: 'totalAmount', title: '金额（元）', width: 110, render: (r) => money(r.totalAmount) },
  { key: 'purchaseOrder', title: '采购单', width: 170, render: (r) => r.purchaseOrder?.orderNo ?? '-' },
  { key: 'sourceFileName', title: '来源文件', ellipsis: { tooltip: true }, render: (r) => r.sourceFileName ?? '手工' },
  { key: 'actions', title: '操作', width: 80, fixed: 'right', render: (r) => h(NButton, { size: 'small', onClick: () => openDetail(r.id) }, { default: () => '查看' }) },
]

// ---------------- Excel 导入 ----------------
const importVisible = ref(false)
const parsing = ref(false)
const importing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref<RequestImportPreview | null>(null)
const fileName = ref('')
const importRows = ref<RequestImportPreviewRow[]>([])
const checked = ref<number[]>([])
const imp = ref({ storeId: null as string | null, requestDate: null as number | null, createMissingItems: true })
const duplicate = ref<{ id: string; requestNo: string; totalAmount: string } | null>(null)
const allowDuplicate = ref(false)

function openImport() {
  preview.value = null
  importRows.value = []
  checked.value = []
  duplicate.value = null
  allowDuplicate.value = false
  imp.value = { storeId: filterStore.value ?? stores.value[0]?.value ?? null, requestDate: Date.now(), createMissingItems: true }
  importVisible.value = true
}

const issuesOf = (r: RequestImportPreviewRow) => {
  const out: string[] = []
  if (r.quantity === null) out.push('缺数量')
  else if (!Number.isInteger(r.quantity) || r.quantity < 1) out.push('数量应为大于 0 的整数')
  return out
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.xlsx$/i.test(file.name)) return void message.error('请上传 Excel（.xlsx）文件；如果是 .xls 请先在 Excel/WPS 里另存为 .xlsx')
  parsing.value = true
  try {
    const p = await purchaseRequestApi.importPreview(file)
    preview.value = p
    fileName.value = file.name
    importRows.value = p.rows
    checked.value = p.rows.filter((r) => issuesOf(r).length === 0).map((r) => r.rowNo)
    imp.value.storeId = p.storeGuess?.id ?? imp.value.storeId
    imp.value.requestDate = p.requestDate ? new Date(`${p.requestDate}T00:00:00`).getTime() : Date.now()
    duplicate.value = p.duplicate
    allowDuplicate.value = false
  } finally {
    parsing.value = false
  }
}

const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 换了门店/日期，重新看看是不是已经导入过
watch(
  () => [imp.value.storeId, imp.value.requestDate, preview.value] as const,
  async ([storeId, date, p]) => {
    if (!p || !storeId || !date) return
    duplicate.value = await purchaseRequestApi.duplicate(storeId, ymd(date))
    allowDuplicate.value = false
  },
)

const selected = computed(() => importRows.value.filter((r) => checked.value.includes(r.rowNo) && issuesOf(r).length === 0))
const calcTotal = computed(() => Math.round(selected.value.reduce((s, r) => s + (r.unitPrice !== null && r.quantity !== null ? r.quantity * r.unitPrice : 0), 0) * 100) / 100)
const noPriceCount = computed(() => selected.value.filter((r) => r.unitPrice === null).length)
const deptSummary = computed(() => {
  const m = new Map<string, number>()
  for (const r of selected.value) m.set(r.department ?? '（未填部门）', (m.get(r.department ?? '（未填部门）') ?? 0) + (r.unitPrice !== null && r.quantity !== null ? r.quantity * r.unitPrice : 0))
  return [...m.entries()].map(([d, v]) => ({ dept: d, amount: Math.round(v * 100) / 100 }))
})

const importColumns: DataTableColumns<RequestImportPreviewRow> = [
  { type: 'selection', disabled: (r) => issuesOf(r).length > 0 },
  { key: 'rowNo', title: '行号', width: 55 },
  { key: 'department', title: '申请部门', width: 85, render: (r) => r.department ?? '-' },
  { key: 'requester', title: '申请人', width: 75, render: (r) => r.requester ?? '-' },
  { key: 'name', title: '物品名称', width: 140 },
  { key: 'spec', title: '规格/型号/尺寸', width: 160, ellipsis: { tooltip: true }, render: (r) => r.spec ?? '-' },
  {
    key: 'quantity',
    title: '数量',
    width: 100,
    render: (r) => h(NInputNumber, { size: 'small', value: r.quantity, min: 1, precision: 0, showButton: false, placeholder: '填数量', onUpdateValue: (v: number | null) => { r.quantity = v; if (v && issuesOf(r).length === 0 && !checked.value.includes(r.rowNo)) checked.value = [...checked.value, r.rowNo] } }),
  },
  {
    key: 'unit',
    title: '单位',
    width: 80,
    render: (r) => (r.itemId ? (r.unit ?? '-') : h(NInput, { size: 'small', value: r.unit ?? '', placeholder: '单位', onUpdateValue: (v: string) => { r.unit = v.trim() || null } })),
  },
  { key: 'unitPrice', title: '单价', width: 80, render: (r) => price(r.unitPrice) },
  { key: 'amount', title: '小计', width: 85, render: (r) => (r.unitPrice !== null && r.quantity !== null ? money(r.quantity * r.unitPrice) : '-') },
  { key: 'purpose', title: '用途', width: 110, ellipsis: { tooltip: true }, render: (r) => r.purpose ?? '-' },
  {
    key: 'item',
    title: '物品资料',
    width: 110,
    render: (r) =>
      issuesOf(r).length > 0
        ? h(NTag, { size: 'small', type: 'warning' }, { default: () => issuesOf(r).join('、') })
        : r.itemId
          ? h(NTag, { size: 'small', type: 'success' }, { default: () => '已有物品' })
          : h(NTag, { size: 'small', type: r.unit && imp.value.createMissingItems ? 'info' : 'default' }, { default: () => (r.unit && imp.value.createMissingItems ? '将新建物品' : '暂不对应') }),
  },
]

async function handleImport() {
  if (!imp.value.storeId) return void message.warning('请选择门店')
  if (selected.value.length === 0) return void message.warning('没有勾选要导入的行')
  importing.value = true
  try {
    const res = await purchaseRequestApi.importCommit({
      storeId: imp.value.storeId,
      requestDate: imp.value.requestDate ? ymd(imp.value.requestDate) : undefined,
      sourceFileName: fileName.value,
      createMissingItems: imp.value.createMissingItems,
      allowDuplicate: allowDuplicate.value,
      rows: selected.value.map(({ rowNo, department, requester, name, spec, brand, unit, quantity, unitPrice, purpose }) => ({ rowNo, department, requester, name, spec, brand, unit, quantity, unitPrice, purpose })),
    })
    importVisible.value = false
    await fetchList()
    dialog.success({
      title: '已生成申购单',
      content: `申购单 ${res.requestNo}：${res.lines} 行，合计 ${money(res.totalAmount)} 元（草稿状态，可以先核对、修改，再提交审批）。${res.unlinked.length ? `有 ${res.unlinked.length} 行物品没有对应的物品资料（${res.unlinked.slice(0, 3).join('、')}${res.unlinked.length > 3 ? '…' : ''}），生成采购单前需要补上。` : ''}`,
      positiveText: '去看看',
      onPositiveClick: () => openDetail(res.id),
    })
  } finally {
    importing.value = false
  }
}

// ---------------- 详情 ----------------
const detail = ref<PurchaseRequest | null>(null)
const detailVisible = ref(false)
async function openDetail(id: string) {
  detail.value = await purchaseRequestApi.get(id)
  detailVisible.value = true
}
async function reloadDetail() {
  if (detail.value) detail.value = await purchaseRequestApi.get(detail.value.id)
  await fetchList()
}
const isDraft = computed(() => detail.value?.status === 'DRAFT')
const detailDeptSummary = computed(() => {
  const m = new Map<string, number>()
  for (const l of detail.value?.items ?? []) m.set(l.department ?? '（未填部门）', (m.get(l.department ?? '（未填部门）') ?? 0) + Number(l.subtotal))
  return [...m.entries()].map(([d, v]) => ({ dept: d, amount: Math.round(v * 100) / 100 }))
})
const noPriceLines = computed(() => (detail.value?.items ?? []).filter((l) => l.unitPrice === null).length)

const detailColumns: DataTableColumns<PurchaseRequestItem> = [
  { key: 'sortNo', title: '序号', width: 55 },
  { key: 'department', title: '申请部门', width: 85, render: (l) => l.department ?? '-' },
  { key: 'requester', title: '申请人', width: 75, render: (l) => l.requester ?? '-' },
  { key: 'name', title: '物品名称', width: 150 },
  { key: 'spec', title: '规格/型号/尺寸', width: 170, ellipsis: { tooltip: true }, render: (l) => l.spec ?? '-' },
  { key: 'brand', title: '品牌', width: 80, render: (l) => l.brand ?? '-' },
  { key: 'quantity', title: '数量', width: 70 },
  { key: 'unit', title: '单位', width: 60, render: (l) => l.unit ?? '-' },
  { key: 'unitPrice', title: '单价', width: 80, render: (l) => price(l.unitPrice) },
  { key: 'subtotal', title: '小计', width: 90, render: (l) => money(l.subtotal) },
  { key: 'purpose', title: '用途', width: 130, ellipsis: { tooltip: true }, render: (l) => l.purpose ?? '-' },
  { key: 'item', title: '物品资料', width: 90, render: (l) => h(NTag, { size: 'small', type: l.itemId ? 'success' : 'warning' }, { default: () => (l.itemId ? '已对应' : '未对应') }) },
  {
    key: 'actions',
    title: '操作',
    width: 130,
    fixed: 'right',
    render: (l) =>
      isDraft.value
        ? h(NSpace, { size: 4 }, { default: () => [h(NButton, { size: 'tiny', onClick: () => openLine(l) }, { default: () => '修改' }), h(NButton, { size: 'tiny', type: 'error', quaternary: true, onClick: () => removeLine(l) }, { default: () => '删除' })] })
        : '',
  },
]

// 修改/新增一行
const lineVisible = ref(false)
const lineSaving = ref(false)
const lineEditing = ref<PurchaseRequestItem | null>(null)
const lineModel = ref({ name: '', spec: '', brand: '', unit: '', quantity: 1 as number | null, unitPrice: null as number | null, department: '', requester: '', purpose: '' })
function openLine(l: PurchaseRequestItem | null) {
  lineEditing.value = l
  lineModel.value = l
    ? { name: l.name, spec: l.spec ?? '', brand: l.brand ?? '', unit: l.unit ?? '', quantity: l.quantity, unitPrice: l.unitPrice === null ? null : Number(l.unitPrice), department: l.department ?? '', requester: l.requester ?? '', purpose: l.purpose ?? '' }
    : { name: '', spec: '', brand: '', unit: '', quantity: 1, unitPrice: null, department: '', requester: '', purpose: '' }
  lineVisible.value = true
}
async function saveLine() {
  if (!detail.value) return
  const m = lineModel.value
  if (!m.name.trim()) return void message.error('请填写物品名称')
  if (!m.quantity || m.quantity < 1) return void message.error('请填写数量')
  lineSaving.value = true
  try {
    const body = { name: m.name, spec: m.spec, brand: m.brand, unit: m.unit, quantity: m.quantity, unitPrice: m.unitPrice, department: m.department, requester: m.requester, purpose: m.purpose }
    detail.value = lineEditing.value
      ? await purchaseRequestApi.updateLine(detail.value.id, lineEditing.value.id, body, detail.value.version)
      : await purchaseRequestApi.addLine(detail.value.id, body, detail.value.version)
    lineVisible.value = false
    await fetchList()
  } finally {
    lineSaving.value = false
  }
}
function removeLine(l: PurchaseRequestItem) {
  dialog.warning({
    title: `删除“${l.name}”这一行？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (!detail.value) return
      detail.value = await purchaseRequestApi.removeLine(detail.value.id, l.id, detail.value.version)
      await fetchList()
    },
  })
}

async function doSubmit() {
  if (!detail.value) return
  const tip = noPriceLines.value > 0 ? `有 ${noPriceLines.value} 行还没有单价（待询价），审批时会按 0 元显示。` : ''
  dialog.info({
    title: '提交审批？',
    content: `提交后不能再改明细，由店长审批。${tip}`,
    positiveText: '提交',
    negativeText: '再看看',
    onPositiveClick: async () => {
      detail.value = await purchaseRequestApi.submit(detail.value!.id, detail.value!.version)
      message.success('已提交审批')
      await fetchList()
    },
  })
}

const cancelVisible = ref(false)
const cancelReason = ref('')
async function doCancel() {
  if (!detail.value) return
  if (!cancelReason.value.trim()) return void message.error('请填写取消原因')
  detail.value = await purchaseRequestApi.cancel(detail.value.id, cancelReason.value.trim(), detail.value.version)
  cancelVisible.value = false
  message.success('申购单已取消')
  await fetchList()
}

// ---------------- 生成采购单 ----------------
const convertVisible = ref(false)
const converting = ref(false)
const suppliers = ref<Supplier[]>([])
const warehouses = ref<Warehouse[]>([])
const allItems = ref<InventoryItem[]>([])
const conv = ref({ supplierId: null as string | null, warehouseId: null as string | null })
const fixPrices = ref<Record<string, number | null>>({})
const fixItems = ref<Record<string, string | null>>({})

async function openConvert() {
  if (!detail.value) return
  const [s, w, items] = await Promise.all([supplierApi.list(), warehouseApi.list({ storeId: detail.value.storeId }), inventoryItemApi.list()])
  suppliers.value = s.filter((x) => x.status === 'ACTIVE')
  warehouses.value = w.filter((x) => x.status === 'ACTIVE')
  allItems.value = items
  conv.value = { supplierId: suppliers.value[0]?.id ?? null, warehouseId: warehouses.value[0]?.id ?? null }
  fixPrices.value = {}
  fixItems.value = {}
  convertVisible.value = true
}
const problemLines = computed(() => (detail.value?.items ?? []).filter((l) => l.unitPrice === null || !l.itemId))
const convertReady = computed(
  () => !!conv.value.supplierId && !!conv.value.warehouseId && problemLines.value.every((l) => (l.unitPrice !== null || (fixPrices.value[l.id] ?? 0) > 0) && (!!l.itemId || !!fixItems.value[l.id])),
)
async function doConvert() {
  if (!detail.value || !conv.value.supplierId || !conv.value.warehouseId) return
  converting.value = true
  try {
    const fixes = problemLines.value.map((l) => ({ lineId: l.id, unitPrice: l.unitPrice === null ? (fixPrices.value[l.id] ?? undefined) : undefined, itemId: !l.itemId ? (fixItems.value[l.id] ?? undefined) : undefined }))
    const res = await purchaseRequestApi.convert(detail.value.id, { supplierId: conv.value.supplierId, warehouseId: conv.value.warehouseId, version: detail.value.version, fixes })
    convertVisible.value = false
    detail.value = await purchaseRequestApi.get(detail.value.id)
    await fetchList()
    dialog.success({
      title: '已生成采购单',
      content: `采购单 ${res.purchaseOrder.orderNo}（草稿）。到“采购单”页面提交采购审批。${res.amountDiff ? `采购单单价按“分”记录，合计与申购单相差 ${Math.abs(res.amountDiff).toFixed(2)} 元（${res.amountDiff > 0 ? '多' : '少'}），属于四舍五入。` : ''}`,
      positiveText: '知道了',
    })
  } finally {
    converting.value = false
  }
}

onMounted(async () => {
  const list = await storeApi.list()
  stores.value = list.map((s) => ({ label: s.name, value: s.id }))
  await fetchList()
})
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" align="center">
      <n-space>
        <n-select v-model:value="filterStore" :options="stores" clearable placeholder="全部门店" style="width: 160px" />
        <n-select v-model:value="filterStatus" :options="statusOptions" clearable placeholder="全部状态" style="width: 170px" />
      </n-space>
      <n-button type="primary" @click="openImport">从 Excel 导入申购表</n-button>
    </n-space>

    <template v-if="isMobile">
      <n-empty v-if="!loading && rows.length === 0" description="还没有申购单，点右上角导入每月的申购表" />
      <div v-for="r in rows" :key="r.id" class="pr-card" @click="openDetail(r.id)">
        <div class="pr-top"><b>{{ r.requestNo }}</b><component :is="() => renderStatusBadge(r.status, PURCHASE_REQUEST_STATUS_MAP)" /></div>
        <div class="pr-line">{{ day(r.requestDate) }} · {{ r.store.name }} · {{ r._count?.items ?? '-' }} 项 · <b>{{ money(r.totalAmount) }} 元</b></div>
        <div v-if="r.purchaseOrder" class="pr-line">采购单 {{ r.purchaseOrder.orderNo }}</div>
      </div>
    </template>
    <n-data-table v-else :columns="columns" :data="rows" :loading="loading" :row-key="(r: PurchaseRequest) => r.id" :scroll-x="1100" />

    <!-- Excel 导入 -->
    <n-modal :show="importVisible" @update:show="(v) => (importVisible = v)">
      <n-card title="从 Excel 导入申购表" style="width: min(1150px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <input ref="fileInput" type="file" accept=".xlsx" style="display: none" @change="onFileChosen" />
        <n-space align="center" style="margin-bottom: 10px">
          <n-button type="primary" :loading="parsing" @click="fileInput?.click()">{{ preview ? '重新选择文件' : '选择申购表（.xlsx）' }}</n-button>
          <span style="color: #888; font-size: 12px">直接用每月在用的申购表，不用改格式</span>
        </n-space>

        <template v-if="preview">
          <n-alert type="info" :show-icon="false" style="margin-bottom: 10px">
            表头：{{ preview.titleText ?? '（没有标题行）' }}。识别出 <b>{{ importRows.length }}</b> 行物品，已勾选 {{ selected.length }} 行，系统按“数量×单价”核算 <b>{{ money(calcTotal) }}</b> 元<template v-if="preview.sheetTotal !== null">（表里写的合计 {{ money(preview.sheetTotal) }} 元<template v-if="Math.abs(calcTotal - preview.sheetTotal) > 0.005 && selected.length === importRows.length">，<b style="color: #d03050">与核算不一致，请核对</b></template><template v-else-if="selected.length === importRows.length">，一致 ✓</template>）</template>。
            <template v-if="noPriceCount > 0">其中 {{ noPriceCount }} 行没有单价（待询价），金额按 0 计。</template>
          </n-alert>
          <n-space align="center" :size="14" style="margin-bottom: 10px">
            <n-space align="center" :size="6"><span>门店</span><n-select v-model:value="imp.storeId" :options="stores" style="width: 170px" /></n-space>
            <n-space align="center" :size="6"><span>申购日期</span><n-date-picker v-model:value="imp.requestDate" type="date" style="width: 160px" /></n-space>
            <n-checkbox v-model:checked="imp.createMissingItems">物品库里没有的，自动新建物品资料（需要有单位）</n-checkbox>
          </n-space>
          <n-alert v-if="duplicate" type="warning" style="margin-bottom: 10px" :show-icon="false">
            这个门店 {{ ymd(imp.requestDate ?? Date.now()) }} 已经有一张申购单 {{ duplicate.requestNo }}（{{ money(duplicate.totalAmount) }} 元）。
            <n-checkbox v-model:checked="allowDuplicate">我确认要再导入一张</n-checkbox>
          </n-alert>
          <n-data-table :columns="importColumns" :data="importRows" :row-key="(r: RequestImportPreviewRow) => r.rowNo" v-model:checked-row-keys="checked" :scroll-x="1200" :max-height="360" size="small" />
          <n-space v-if="deptSummary.length" :size="8" style="margin-top: 8px">
            <n-tag v-for="d in deptSummary" :key="d.dept" size="small" round>{{ d.dept }}：{{ money(d.amount) }} 元</n-tag>
          </n-space>
          <div style="margin-top: 6px; color: #999; font-size: 12px">缺数量的行需要先填数量才能导入。单价为空的行导入后显示“待询价”，之后可以补。</div>
        </template>
        <n-empty v-else description="先选择申购表，系统会识别并让你核对后再导入" style="padding: 24px 0" />

        <template #footer>
          <n-space justify="end">
            <n-button @click="importVisible = false">取消</n-button>
            <n-button type="primary" :loading="importing" :disabled="selected.length === 0 || (!!duplicate && !allowDuplicate)" @click="handleImport">导入勾选的 {{ selected.length }} 行，生成申购单</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 详情 -->
    <n-modal :show="detailVisible" @update:show="(v) => (detailVisible = v)">
      <n-card v-if="detail" :title="`申购单 ${detail.requestNo}`" style="width: min(1150px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <template #header-extra><component :is="() => renderStatusBadge(detail!.status, PURCHASE_REQUEST_STATUS_MAP)" /></template>
        <n-descriptions :column="isMobile ? 1 : 4" label-placement="left" size="small" bordered style="margin-bottom: 10px">
          <n-descriptions-item label="门店">{{ detail.store.name }}</n-descriptions-item>
          <n-descriptions-item label="申购日期">{{ day(detail.requestDate) }}</n-descriptions-item>
          <n-descriptions-item label="合计金额"><b>{{ money(detail.totalAmount) }} 元</b></n-descriptions-item>
          <n-descriptions-item label="来源">{{ detail.sourceFileName ?? '手工' }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.purchaseOrder" label="采购单">{{ detail.purchaseOrder.orderNo }}</n-descriptions-item>
          <n-descriptions-item v-if="detail.cancelReason" label="取消原因">{{ detail.cancelReason }}</n-descriptions-item>
        </n-descriptions>
        <n-space :size="8" style="margin-bottom: 8px">
          <n-tag v-for="d in detailDeptSummary" :key="d.dept" size="small" round>{{ d.dept }}：{{ money(d.amount) }} 元</n-tag>
        </n-space>
        <n-alert v-if="noPriceLines > 0" type="warning" :show-icon="false" style="margin-bottom: 8px">有 {{ noPriceLines }} 行还没有单价（待询价）。</n-alert>
        <n-space v-if="isDraft" style="margin-bottom: 8px"><n-button size="small" @click="openLine(null)">＋ 加一行</n-button></n-space>
        <n-data-table :columns="detailColumns" :data="detail.items" :row-key="(l: PurchaseRequestItem) => l.id" :scroll-x="1250" :max-height="380" size="small" />
        <template #footer>
          <n-space justify="end">
            <n-button v-if="['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(detail.status)" quaternary type="error" @click="(cancelReason = ''), (cancelVisible = true)">取消申购单</n-button>
            <n-button v-if="detail.status === 'DRAFT'" type="primary" @click="doSubmit">提交审批</n-button>
            <n-button v-if="detail.status === 'APPROVED'" type="primary" @click="openConvert">生成采购单</n-button>
            <n-button @click="detailVisible = false">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 修改/新增一行 -->
    <n-modal :show="lineVisible" @update:show="(v) => (lineVisible = v)">
      <n-card :title="lineEditing ? '修改这一行' : '加一行'" style="width: min(520px, 96vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100" size="small">
          <n-form-item label="物品名称"><n-input v-model:value="lineModel.name" /></n-form-item>
          <n-form-item label="规格/型号/尺寸"><n-input v-model:value="lineModel.spec" /></n-form-item>
          <n-form-item label="品牌"><n-input v-model:value="lineModel.brand" /></n-form-item>
          <n-form-item label="数量"><n-input-number v-model:value="lineModel.quantity" :min="1" :precision="0" style="width: 100%" /></n-form-item>
          <n-form-item label="单位"><n-input v-model:value="lineModel.unit" /></n-form-item>
          <n-form-item label="单价（元）"><n-input-number v-model:value="lineModel.unitPrice" :min="0" :precision="4" :show-button="false" placeholder="不知道可留空=待询价" style="width: 100%" /></n-form-item>
          <n-form-item label="申请部门"><n-input v-model:value="lineModel.department" /></n-form-item>
          <n-form-item label="申请人"><n-input v-model:value="lineModel.requester" /></n-form-item>
          <n-form-item label="用途"><n-input v-model:value="lineModel.purpose" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end"><n-button @click="lineVisible = false">取消</n-button><n-button type="primary" :loading="lineSaving" @click="saveLine">保存</n-button></n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 取消 -->
    <n-modal :show="cancelVisible" @update:show="(v) => (cancelVisible = v)">
      <n-card title="取消申购单" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-input v-model:value="cancelReason" type="textarea" placeholder="请填写取消原因" :autosize="{ minRows: 2 }" />
        <template #footer>
          <n-space justify="end"><n-button @click="cancelVisible = false">不取消</n-button><n-button type="error" @click="doCancel">确认取消</n-button></n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 生成采购单 -->
    <n-modal :show="convertVisible" @update:show="(v) => (convertVisible = v)">
      <n-card title="生成采购单" style="width: min(760px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80" size="small">
          <n-form-item label="供应商"><n-select v-model:value="conv.supplierId" :options="suppliers.map((s) => ({ label: s.name, value: s.id }))" filterable placeholder="选择供应商" /></n-form-item>
          <n-form-item label="入库仓库"><n-select v-model:value="conv.warehouseId" :options="warehouses.map((w) => ({ label: w.name, value: w.id }))" placeholder="选择收货入库的仓库" /></n-form-item>
        </n-form>
        <template v-if="problemLines.length">
          <n-alert type="warning" :show-icon="false" style="margin-bottom: 8px">下面这些行还缺单价或没对上物品资料，请补全后才能生成采购单（批准之后才报价的很常见）。</n-alert>
          <div v-for="l in problemLines" :key="l.id" class="pr-fix">
            <div class="pr-fix-name"><b>{{ l.name }}</b> <span class="pr-sub">{{ l.spec ?? '' }} · {{ l.quantity }}{{ l.unit ?? '' }}</span></div>
            <n-input-number v-if="l.unitPrice === null" v-model:value="fixPrices[l.id]" :min="0" :precision="4" :show-button="false" placeholder="单价（元）" style="width: 130px" />
            <n-select v-if="!l.itemId" v-model:value="fixItems[l.id]" :options="allItems.map((i) => ({ label: `${i.name}${i.spec ? ' ' + i.spec : ''}（${i.unit}）`, value: i.id }))" filterable placeholder="对应哪个物品" style="width: 260px" />
          </div>
        </template>
        <template #footer>
          <n-space justify="end"><n-button @click="convertVisible = false">取消</n-button><n-button type="primary" :loading="converting" :disabled="!convertReady" @click="doConvert">生成采购单</n-button></n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.pr-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.pr-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pr-line {
  margin-top: 4px;
  color: #555;
  font-size: 12px;
}
.pr-fix {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
}
.pr-fix-name {
  flex: 1 1 200px;
}
.pr-sub {
  color: #888;
  font-size: 12px;
}
</style>
