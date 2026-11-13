<script setup lang="ts">
/**
 * 申购单：把每月的《申购表》Excel 直接导入成系统里的申购单 → 提交审批 → 批准后选供应商和仓库生成采购单。
 * 表里的 申请部门/申请人/物品/规格/品牌/数量/单位/单价/用途 都会保留，金额按“数量×单价”重新核算并和表里的合计对账。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NTag, NAlert, NCheckbox, NDatePicker, NEmpty, NDescriptions, NDescriptionsItem,
  NTabs, NTabPane,
  type DataTableColumns,
} from 'naive-ui'
import { inventoryItemApi, purchaseRequestApi, supplierApi, warehouseApi } from '../../api/modules/inventory.api'
import { storeApi } from '../../api/modules/store.api'
import ApprovalProgress from '../../components/workflow/ApprovalProgress.vue'
import ItemSelect from '../../components/inventory/ItemSelect.vue'
import { docMatches, itemMatches } from '../../utils/item-search'
import ItemLinesEditor, { type ItemLine } from '../../components/inventory/ItemLinesEditor.vue'
import { useAuthStore } from '../../stores/auth'
import type {
  InventoryItem, PurchaseRequest, PurchaseRequestItem, PurchaseRequestStatus, RequestImportPreview, RequestImportPreviewRow, Supplier, Warehouse,
} from '../../api/types/inventory'
import { renderStatusBadge, PURCHASE_REQUEST_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useFormDraft } from '../../composables/useFormDraft'

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

// 采购流程：部门负责人填“部门申购单”→ 客服在“部门申购”里勾选汇总 → 汇总申购单（店长审批）→ 采购员生成采购单
const route = useRoute()
const auth = useAuthStore()
const canCollect = computed(() => auth.hasAccess('inventory.purchase-request.collect'))
const canConvert = computed(() => auth.hasAccess('inventory.purchase-request.convert'))
const canCreateRequest = computed(() => auth.hasAccess('inventory.purchase-request.create'))
const isStaff = computed(() => canCollect.value || canConvert.value) // 采购岗：能看整个门店；其它人只看自己的部门申购单
const tab = ref<'dept' | 'summary'>(route.query.tab === 'dept' ? 'dept' : isStaff.value ? 'summary' : 'dept')
const DEPT_STATUS = ['DRAFT', 'SUBMITTED', 'COLLECTED', 'CANCELLED']
const statusOptions = computed(() =>
  Object.entries(PURCHASE_REQUEST_STATUS_MAP)
    .filter(([k]) => (tab.value === 'dept' ? DEPT_STATUS.includes(k) : !['SUBMITTED', 'COLLECTED'].includes(k)))
    .map(([value, m]) => ({ label: m.label, value })),
)
const collectKeys = ref<string[]>([])
// 搜索：申购单号 / 申请部门 / 申请人 / 门店 / 里面的物品名称（支持拼音首字母）
const keyword = ref('')
const shownRows = computed(() => rows.value.filter((r) => docMatches(keyword.value, [r.requestNo, r.departmentName, r.creatorName, r.store?.name, r.remark], (r.items ?? []).map((i) => ({ name: i.name, spec: i.spec })))))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await purchaseRequestApi.list({ storeId: filterStore.value ?? undefined, status: filterStatus.value ?? undefined, kind: tab.value === 'dept' ? 'DEPARTMENT' : 'SUMMARY' })
    collectKeys.value = collectKeys.value.filter((id) => rows.value.some((r) => r.id === id && r.status === 'SUBMITTED'))
  } finally {
    loading.value = false
  }
}
watch([filterStore, filterStatus], fetchList)
watch(tab, () => {
  filterStatus.value = null
  collectKeys.value = []
  fetchList()
})

const columns = computed<DataTableColumns<PurchaseRequest>>(() => [
  ...(tab.value === 'dept' && canCollect.value ? [{ type: 'selection' as const, disabled: (r: PurchaseRequest) => r.status !== 'SUBMITTED' }] : []),
  { key: 'requestNo', title: '申购单号', width: 170, render: (r) => h('a', { style: 'cursor:pointer;color:var(--c-2080f0)', onClick: () => openDetail(r.id) }, r.requestNo) },
  ...(tab.value === 'dept'
    ? [
        { key: 'dept', title: '申请部门', width: 110, render: (r: PurchaseRequest) => r.departmentName ?? '-' },
        { key: 'creator', title: '提交人', width: 90, render: (r: PurchaseRequest) => r.creatorName ?? '-' },
      ]
    : []),
  { key: 'requestDate', title: '申购日期', width: 110, render: (r) => day(r.requestDate) },
  { key: 'store', title: '门店', width: 130, render: (r) => r.store.name },
  { key: 'status', title: '状态', width: 150, render: (r) => renderStatusBadge(r.status, PURCHASE_REQUEST_STATUS_MAP) },
  { key: 'count', title: '物品数', width: 80, render: (r) => r._count?.items ?? '-' },
  { key: 'totalAmount', title: '金额（元）', width: 110, render: (r) => money(r.totalAmount) },
  tab.value === 'dept'
    ? { key: 'summaryRequest', title: '汇总到', width: 170, render: (r: PurchaseRequest) => r.summaryRequest?.requestNo ?? '-' }
    : { key: 'purchaseOrder', title: '采购单', width: 170, render: (r: PurchaseRequest) => r.purchaseOrder?.orderNo ?? '-' },
  { key: 'actions', title: '操作', width: 80, fixed: 'right', render: (r) => h(NButton, { size: 'small', onClick: () => openDetail(r.id) }, { default: () => '查看' }) },
])

// ---------------- 部门申购单：新建 / 汇总 ----------------
const deptVisible = ref(false)
const deptSaving = ref(false)
const deptLines = ref<ItemLine[]>([])
const deptRemark = ref('')
// 部门申购单填到一半被刷新/闪退/误关：重新打开能恢复
const deptDraftModel = computed({
  get: () => ({ lines: deptLines.value, remark: deptRemark.value }),
  set: (v) => {
    deptLines.value = v.lines
    deptRemark.value = v.remark
  },
})
const deptDraft = useFormDraft('purchase-request-dept', deptDraftModel, (m) => m.lines.length === 0 && !m.remark)
function openDept() {
  deptLines.value = []
  deptRemark.value = ''
  deptVisible.value = true
  deptDraft.start()
}
/** 编辑器里的明细 → 接口的申购行 */
function toBody(lines: ItemLine[]) {
  return lines.map((l) => ({
    itemId: l.itemId ?? undefined,
    name: l.name.trim(),
    spec: l.spec.trim() || null,
    brand: l.brand.trim() || null,
    quantity: l.quantity!,
    unit: l.unit.trim() || null,
    unitPrice: l.unitPrice,
    purpose: l.purpose.trim() || null,
  }))
}
function checkLines(lines: ItemLine[], needUnitForNew: boolean): string | null {
  if (lines.length === 0) return '请至少添加一项要申购的物品'
  for (const l of lines) {
    if (!l.name.trim()) return '有一行新物品还没填名称'
    if (!l.quantity || l.quantity < 1) return `「${l.name}」请填写数量`
    if (needUnitForNew && !l.itemId && !l.unit.trim()) return `新物品「${l.name}」请填写单位（要加入物品库）`
  }
  return null
}
async function saveDept(submit: boolean) {
  const err = checkLines(deptLines.value, false)
  if (err) return void message.error(err)
  deptSaving.value = true
  try {
    await purchaseRequestApi.createDepartment({ submit, remark: deptRemark.value.trim() || undefined, items: toBody(deptLines.value) })
    deptDraft.clear()
    deptVisible.value = false
    message.success(submit ? '已提交，客服会在“待汇总”里看到' : '已保存为草稿，确认无误后再提交')
    await fetchList()
  } finally {
    deptSaving.value = false
  }
}

// ---------------- 手动新建申购单（汇总申购单） ----------------
const manualVisible = ref(false)
const manualSaving = ref(false)
const manual = ref({ storeId: null as string | null, date: Date.now() as number | null, remark: '', createMissingItems: true })
const manualLines = ref<ItemLine[]>([])
const manualDraftModel = computed({
  get: () => ({ m: manual.value, lines: manualLines.value }),
  set: (v) => {
    manual.value = v.m
    manualLines.value = v.lines
  },
})
const manualDraft = useFormDraft('purchase-request-manual', manualDraftModel, (d) => d.lines.length === 0 && !d.m.remark)
function openManual() {
  manual.value = { storeId: filterStore.value ?? stores.value[0]?.value ?? null, date: Date.now(), remark: '', createMissingItems: true }
  manualLines.value = []
  manualVisible.value = true
  manualDraft.start()
}
async function saveManual() {
  if (!manual.value.storeId) return void message.error('请选择门店')
  const err = checkLines(manualLines.value, manual.value.createMissingItems)
  if (err) return void message.error(err)
  manualSaving.value = true
  try {
    const d = new Date(manual.value.date ?? Date.now())
    const requestDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const created = await purchaseRequestApi.create({ storeId: manual.value.storeId, requestDate, remark: manual.value.remark.trim() || undefined, items: toBody(manualLines.value), createMissingItems: manual.value.createMissingItems })
    manualDraft.clear()
    manualVisible.value = false
    message.success('申购单已保存为草稿：可以点开补单价、改数量，没问题再提交审批')
    await fetchList()
    void openDetail(created.id)
  } finally {
    manualSaving.value = false
  }
}
const collecting = ref(false)
function doCollect() {
  if (collectKeys.value.length === 0) return void message.error('请先勾选要汇总的部门申购单')
  dialog.info({
    title: `汇总 ${collectKeys.value.length} 张部门申购单？`,
    content: '会合并成一张汇总申购单（草稿），你可以补全单价、调整数量后再提交店长审批。',
    positiveText: '汇总',
    negativeText: '再看看',
    onPositiveClick: async () => {
      collecting.value = true
      try {
        const summary = await purchaseRequestApi.collect(collectKeys.value)
        collectKeys.value = []
        message.success(`已生成汇总申购单 ${summary.requestNo}`)
        tab.value = 'summary'
        await fetchList()
        await openDetail(summary.id)
      } finally {
        collecting.value = false
      }
    },
  })
}

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
const detailKeyword = ref('')
const detailLines = computed(() => (detail.value?.items ?? []).filter((l) => itemMatches({ name: l.name, spec: l.spec, brand: l.brand }, detailKeyword.value)))
watch(detail, (d, o) => d?.id !== o?.id && (detailKeyword.value = ''))
const detailVisible = ref(false)
async function openDetail(id: string) {
  detail.value = await purchaseRequestApi.get(id)
  detailVisible.value = true
}
const isDraft = computed(() => detail.value?.status === 'DRAFT')
/** 草稿，或待审批时我是当前审批人 → 可以改明细 */
const canEditLines = computed(() => isDraft.value || !!detail.value?.canApproverEdit)
const isDept = computed(() => detail.value?.kind === 'DEPARTMENT')
const isMine = computed(() => !!detail.value && detail.value.createdBy === auth.account?.id)
async function doRecall() {
  if (!detail.value) return
  detail.value = await purchaseRequestApi.recall(detail.value.id, detail.value.version)
  message.success('已撤回，可以修改后重新提交')
  await fetchList()
}
// 审批进度里点了通过/驳回/撤回之后：重新取一遍申购单（后端会按审批结果同步单据状态）并刷新列表
async function onApprovalChanged() {
  if (!detail.value) return
  detail.value = await purchaseRequestApi.get(detail.value.id)
  await fetchList()
}
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
      canEditLines.value
        ? h(NSpace, { size: 4 }, { default: () => [h(NButton, { size: 'tiny', onClick: () => openLine(l) }, { default: () => '修改' }), h(NButton, { size: 'tiny', type: 'error', quaternary: true, onClick: () => removeLine(l) }, { default: () => '删除' })] })
        : '',
  },
]

// 修改/新增一行
const lineVisible = ref(false)
const lineSaving = ref(false)
const lineEditing = ref<PurchaseRequestItem | null>(null)
const allItems = ref<InventoryItem[]>([])
async function ensureItems() {
  if (allItems.value.length === 0) allItems.value = await inventoryItemApi.list().catch(() => [])
}
const lineItemId = ref<string | null>(null)
function pickLineItem(id: string) {
  const it = allItems.value.find((x) => x.id === id)
  if (!it) return
  lineItemId.value = it.id
  lineModel.value = { ...lineModel.value, name: it.name, spec: it.spec ?? '', brand: it.brand ?? '', unit: it.unit, unitPrice: lineModel.value.unitPrice ?? (it.referencePrice ? Number(it.referencePrice) : null) }
}
const lineModel = ref({ name: '', spec: '', brand: '', unit: '', quantity: 1 as number | null, unitPrice: null as number | null, department: '', requester: '', purpose: '' })
function openLine(l: PurchaseRequestItem | null) {
  lineEditing.value = l
  lineItemId.value = l?.itemId ?? null
  void ensureItems()
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
    const body = { ...(lineItemId.value ? { itemId: lineItemId.value } : {}), name: m.name, spec: m.spec, brand: m.brand, unit: m.unit, quantity: m.quantity, unitPrice: m.unitPrice, department: m.department, requester: m.requester, purpose: m.purpose }
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
  const dept = detail.value.kind === 'DEPARTMENT'
  dialog.info({
    title: dept ? '提交给客服汇总？' : '提交店长审批？',
    content: dept ? '提交后客服会在“待汇总”里看到这张申购单（提交后、被汇总前你还可以撤回修改）。' : `提交后不能再改明细，由店长审批；批准后交给采购员采购。${tip}`,
    positiveText: '提交',
    negativeText: '再看看',
    onPositiveClick: async () => {
      detail.value = await purchaseRequestApi.submit(detail.value!.id, detail.value!.version)
      message.success(dept ? '已提交，等客服汇总' : '已提交审批')
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
      content: `采购单 ${res.purchaseOrder.orderNo} 已生成，不需要再审批，直接交给采购员采购（采购员的待办里会出现）。${res.amountDiff ? `采购单单价按“分”记录，合计与申购单相差 ${Math.abs(res.amountDiff).toFixed(2)} 元（${res.amountDiff > 0 ? '多' : '少'}），属于四舍五入。` : ''}`,
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
  // 从审批详情点“去看申购单”过来：直接打开这张单（审批人可以在里面改明细再通过）
  if (typeof route.query.open === 'string') void openDetail(route.query.open)
})
</script>

<template>
  <div>
    <div class="pr-flow">采购流程：① 部门负责人填申购单 → ② 自动汇总给客服 → ③ 客服提交店长审批 → ④ 采购员采购（不再审批）→ ⑤ 客服逐项收货入库</div>
    <n-tabs v-if="isStaff" v-model:value="tab" type="line" style="margin-bottom: 8px">
      <n-tab-pane name="dept" tab="部门申购（待汇总）" />
      <n-tab-pane name="summary" tab="汇总申购单" />
    </n-tabs>
    <n-space justify="space-between" style="margin-bottom: 12px" align="center">
      <n-space>
        <n-input v-model:value="keyword" clearable placeholder="🔍 搜索：单号 / 部门 / 申请人 / 物品名称（支持拼音首字母）" style="width: min(380px, 94vw)" />
        <n-select v-model:value="filterStore" :options="stores" clearable placeholder="全部门店" style="width: 160px" />
        <n-select v-model:value="filterStatus" :options="statusOptions" clearable placeholder="全部状态" style="width: 170px" />
      </n-space>
      <n-space>
        <n-button v-if="tab === 'dept' && canCollect" type="warning" :disabled="collectKeys.length === 0" :loading="collecting" @click="doCollect">汇总所选（{{ collectKeys.length }}）</n-button>
        <n-button v-if="tab === 'dept'" type="primary" @click="openDept">＋ 新建部门申购单</n-button>
        <template v-else>
          <n-button v-if="canCreateRequest" type="primary" @click="openManual">＋ 手动新建申购单</n-button>
          <n-button v-if="canCreateRequest" @click="openImport">从 Excel 导入申购表</n-button>
        </template>
      </n-space>
    </n-space>

    <template v-if="isMobile">
      <n-empty v-if="!loading && shownRows.length === 0" :description="tab === 'dept' ? '还没有部门申购单，点右上角新建' : '还没有汇总申购单，点右上角手动新建或导入每月的申购表，或到“部门申购”里汇总'" />
      <div v-for="r in shownRows" :key="r.id" class="pr-card" @click="openDetail(r.id)">
        <div class="pr-top">
          <n-checkbox v-if="tab === 'dept' && canCollect && r.status === 'SUBMITTED'" :checked="collectKeys.includes(r.id)" @click.stop @update:checked="(v: boolean) => (collectKeys = v ? [...collectKeys, r.id] : collectKeys.filter((x) => x !== r.id))" />
          <b>{{ r.requestNo }}</b><component :is="() => renderStatusBadge(r.status, PURCHASE_REQUEST_STATUS_MAP)" />
        </div>
        <div class="pr-line"><template v-if="r.kind === 'DEPARTMENT'">{{ r.departmentName }} · {{ r.creatorName }} · </template>{{ day(r.requestDate) }} · {{ r._count?.items ?? '-' }} 项<template v-if="r.kind !== 'DEPARTMENT'"> · {{ r.store.name }} · <b>{{ money(r.totalAmount) }} 元</b></template></div>
        <div v-if="r.purchaseOrder" class="pr-line">采购单 {{ r.purchaseOrder.orderNo }}</div>
        <div v-if="r.summaryRequest" class="pr-line">已汇总到 {{ r.summaryRequest.requestNo }}</div>
      </div>
    </template>
    <n-data-table v-else :columns="columns" :data="shownRows" :loading="loading" :row-key="(r: PurchaseRequest) => r.id" v-model:checked-row-keys="collectKeys" :scroll-x="1100" />

    <!-- Excel 导入 -->
    <n-modal :mask-closable="false" :show="importVisible" @update:show="(v) => (importVisible = v)">
      <n-card title="从 Excel 导入申购表" style="width: min(1150px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" closable @close="importVisible = false" aria-modal="true">
        <input ref="fileInput" type="file" accept=".xlsx" style="display: none" @change="onFileChosen" />
        <n-space align="center" style="margin-bottom: 10px">
          <n-button type="primary" :loading="parsing" @click="fileInput?.click()">{{ preview ? '重新选择文件' : '选择申购表（.xlsx）' }}</n-button>
          <span style="color: var(--c-888888); font-size: 12px">直接用每月在用的申购表，不用改格式</span>
        </n-space>

        <template v-if="preview">
          <n-alert type="info" :show-icon="false" style="margin-bottom: 10px">
            表头：{{ preview.titleText ?? '（没有标题行）' }}。识别出 <b>{{ importRows.length }}</b> 行物品，已勾选 {{ selected.length }} 行，系统按“数量×单价”核算 <b>{{ money(calcTotal) }}</b> 元<template v-if="preview.sheetTotal !== null">（表里写的合计 {{ money(preview.sheetTotal) }} 元<template v-if="Math.abs(calcTotal - preview.sheetTotal) > 0.005 && selected.length === importRows.length">，<b style="color: var(--c-d03050)">与核算不一致，请核对</b></template><template v-else-if="selected.length === importRows.length">，一致 ✓</template>）</template>。
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
          <div style="margin-top: 6px; color: var(--c-999999); font-size: 12px">缺数量的行需要先填数量才能导入。单价为空的行导入后显示“待询价”，之后可以补。</div>
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

    <!-- 新建部门申购单 -->
    <n-modal :mask-closable="false" :show="deptVisible" @update:show="(v) => (deptVisible = v)">
      <n-card title="新建部门申购单" style="width: min(860px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" closable @close="deptVisible = false" aria-modal="true">
        <p class="pr-tip">填写本部门要买的东西。申请部门和申请人会自动带出（取自你的账号）。提交后自动汇总给客服，由客服统一提交店长审批。单价不知道可以不填，客服会补。</p>
        <item-lines-editor v-model="deptLines" />
        <n-input v-model:value="deptRemark" type="textarea" placeholder="备注（选填）" :autosize="{ minRows: 1 }" style="margin-top: 10px" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="deptVisible = false">取消</n-button>
            <n-button :loading="deptSaving" @click="saveDept(false)">存为草稿</n-button>
            <n-button type="primary" :loading="deptSaving" @click="saveDept(true)">保存并提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 手动新建申购单 -->
    <n-modal :mask-closable="false" :show="manualVisible" @update:show="(v) => (manualVisible = v)">
      <n-card title="手动新建申购单" style="width: min(900px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" closable @close="manualVisible = false" aria-modal="true">
        <p class="pr-tip">先在搜索框里找物品库里已有的物品，点一下加入；之前没采购过的东西点“添加未录入的新物品”自己填。保存后是草稿，可以再补单价、改数量，没问题再提交审批。</p>
        <n-space align="center" :size="14" style="margin-bottom: 10px" :wrap="true">
          <n-space align="center" :size="6"><span>门店</span><n-select v-model:value="manual.storeId" :options="stores" style="width: 170px" /></n-space>
          <n-space align="center" :size="6"><span>申购日期</span><n-date-picker v-model:value="manual.date" type="date" style="width: 150px" /></n-space>
        </n-space>
        <item-lines-editor v-model="manualLines" />
        <n-checkbox v-model:checked="manual.createMissingItems" style="margin-top: 8px">新物品同时加入物品库（需要填写单位），下次直接搜得到</n-checkbox>
        <n-input v-model:value="manual.remark" type="textarea" placeholder="备注（选填）" :autosize="{ minRows: 1 }" style="margin-top: 10px" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="manualVisible = false">取消</n-button>
            <n-button type="primary" :loading="manualSaving" @click="saveManual">保存为草稿</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 详情 -->
    <n-modal :show="detailVisible" @update:show="(v) => (detailVisible = v)">
      <n-card v-if="detail" :title="`${isDept ? '部门申购单' : '汇总申购单'} ${detail.requestNo}`" style="width: min(1150px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" closable @close="detailVisible = false" aria-modal="true">
        <template #header-extra><component :is="() => renderStatusBadge(detail!.status, PURCHASE_REQUEST_STATUS_MAP)" /></template>
        <n-descriptions :column="isMobile ? 1 : 4" label-placement="left" size="small" bordered style="margin-bottom: 10px">
          <n-descriptions-item v-if="isDept" label="申请部门">{{ detail.departmentName ?? '-' }}</n-descriptions-item>
          <n-descriptions-item v-if="isDept && detail.summaryRequest" label="已汇总到">{{ detail.summaryRequest.requestNo }}</n-descriptions-item>
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
        <n-card v-if="!isDept && detail.status !== 'DRAFT'" size="small" title="审批进度" style="margin-bottom: 10px; background: var(--c-fcfaf6)">
          <ApprovalProgress :key="detail.id + detail.status" business-type="PURCHASE_REQUEST" :business-id="detail.id" @changed="onApprovalChanged" />
        </n-card>
        <n-alert v-if="detail.canApproverEdit" type="info" :show-icon="false" style="margin-bottom: 8px">你是当前审批人：通过前可以直接修改下面的物品名称、规格型号、数量、单价等，也可以加行、删行，改动会留下记录。改好后在上面的“审批进度”里点通过。</n-alert>
        <n-space v-if="canEditLines" style="margin-bottom: 8px"><n-button size="small" @click="openLine(null)">＋ 加一行</n-button></n-space>
        <n-input v-if="detail.items.length > 6" v-model:value="detailKeyword" clearable placeholder="🔍 在这张申购单里搜物品（名称 / 规格 / 拼音首字母）" style="margin-bottom: 8px; max-width: 420px" />
        <n-data-table :columns="detailColumns" :data="detailLines" :row-key="(l: PurchaseRequestItem) => l.id" :scroll-x="1250" :max-height="380" size="small" />
        <template #footer>
          <n-space justify="end">
            <n-button v-if="['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(detail.status) && (!isDept || isMine || canCollect)" quaternary type="error" @click="(cancelReason = ''), (cancelVisible = true)">取消申购单</n-button>
            <n-button v-if="isDept && detail.status === 'SUBMITTED' && (isMine || canCollect)" @click="doRecall">撤回修改</n-button>
            <n-button v-if="detail.status === 'DRAFT'" type="primary" @click="doSubmit">{{ isDept ? '提交给客服汇总' : '提交店长审批' }}</n-button>
            <n-button v-if="!isDept && detail.status === 'APPROVED' && canConvert" type="primary" @click="openConvert">生成采购单</n-button>
            <n-button @click="detailVisible = false">关闭</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 修改/新增一行 -->
    <n-modal :mask-closable="false" :show="lineVisible" @update:show="(v) => (lineVisible = v)">
      <n-card :title="lineEditing ? '修改这一行' : '加一行'" style="width: min(520px, 96vw)" :bordered="false" role="dialog" closable @close="lineVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="100" size="small">
          <n-form-item v-if="allItems.length > 0" label="从物品库选"><item-select :model-value="lineItemId" :items="allItems" @update:model-value="pickLineItem" /></n-form-item>
          <n-form-item label="物品名称"><n-input v-model:value="lineModel.name" placeholder="没在物品库里的新物品直接填名称" @update:value="lineItemId = null" /></n-form-item>
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
    <n-modal :mask-closable="false" :show="cancelVisible" @update:show="(v) => (cancelVisible = v)">
      <n-card title="取消申购单" style="width: min(420px, 94vw)" :bordered="false" role="dialog" closable @close="cancelVisible = false" aria-modal="true">
        <n-input v-model:value="cancelReason" type="textarea" placeholder="请填写取消原因" :autosize="{ minRows: 2 }" />
        <template #footer>
          <n-space justify="end"><n-button @click="cancelVisible = false">不取消</n-button><n-button type="error" @click="doCancel">确认取消</n-button></n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 生成采购单 -->
    <n-modal :mask-closable="false" :show="convertVisible" @update:show="(v) => (convertVisible = v)">
      <n-card title="生成采购单" style="width: min(760px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" closable @close="convertVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="80" size="small">
          <n-form-item label="供应商"><n-select v-model:value="conv.supplierId" :options="suppliers.map((s) => ({ label: s.name, value: s.id }))" filterable placeholder="选择供应商" /></n-form-item>
          <n-form-item label="入库仓库"><n-select v-model:value="conv.warehouseId" :options="warehouses.map((w) => ({ label: w.name, value: w.id }))" placeholder="选择收货入库的仓库" /></n-form-item>
        </n-form>
        <template v-if="problemLines.length">
          <n-alert type="warning" :show-icon="false" style="margin-bottom: 8px">下面这些行还缺单价或没对上物品资料，请补全后才能生成采购单（批准之后才报价的很常见）。</n-alert>
          <div v-for="l in problemLines" :key="l.id" class="pr-fix">
            <div class="pr-fix-name"><b>{{ l.name }}</b> <span class="pr-sub">{{ l.spec ?? '' }} · {{ l.quantity }}{{ l.unit ?? '' }}</span></div>
            <n-input-number v-if="l.unitPrice === null" v-model:value="fixPrices[l.id]" :min="0" :precision="4" :show-button="false" placeholder="单价（元）" style="width: 130px" />
            <item-select v-if="!l.itemId" :model-value="fixItems[l.id]" :items="allItems" placeholder="搜索并选择对应的物品（名称 / 拼音首字母）" @update:model-value="(v) => (fixItems[l.id] = v)" />
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
  border: 1px solid var(--c-eeeeee);
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
  color: var(--c-555555);
  font-size: 12px;
}
.pr-fix {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--c-eeeeee);
}
.pr-fix-name {
  flex: 1 1 200px;
}
.pr-sub {
  color: var(--c-888888);
  font-size: 12px;
}
.pr-flow {
  margin-bottom: 10px;
  padding: 6px 10px;
  background: var(--c-faf6f0);
  border-radius: 6px;
  color: var(--c-8a5a22);
  font-size: 12px;
  line-height: 1.7;
}
.pr-tip {
  margin: 0 0 10px;
  color: var(--c-666666);
  font-size: 13px;
  line-height: 1.7;
}
.pr-line-box {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--c-eeeeee);
  border-radius: 8px;
}
.pr-line-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.pr-grid {
  display: grid;
  grid-template-columns: 2fr 1.4fr 1fr 1fr 1fr 1.4fr;
  gap: 8px;
}
@media (max-width: 767px) {
  .pr-grid {
    grid-template-columns: 1fr 1fr;
  }
  .pr-grid > :first-child {
    grid-column: 1 / -1;
  }
}
</style>
