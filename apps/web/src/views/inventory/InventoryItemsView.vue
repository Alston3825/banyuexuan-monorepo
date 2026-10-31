<script setup lang="ts">
/**
 * 物品管理：除了手工新建，还能直接上传现在在用的采购申购表（Excel）批量导入——
 * 系统自动找到表头，按“物品名称/规格/品牌/单位/单价”识别，表里的数量、申请人、小计等用不上的列自动忽略；
 * 导入前先预览核对，已有的同名同规格物品不会重复建。
 */
import { computed, h, onMounted, ref } from 'vue'
import {
  NAutoComplete, NButton, NCheckbox, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NTag, NAlert, NRadioGroup, NRadio, NEmpty,
  type DataTableColumns, type FormInst,
} from 'naive-ui'
import { inventoryItemApi } from '../../api/modules/inventory.api'
import type { InventoryItem, ItemImportPreview, ItemImportPreviewRow, ItemImportStatus } from '../../api/types/inventory'
import { itemMatches } from '../../utils/item-search'
import { renderStatusBadge, COMMON_STATUS_MAP, WAREHOUSE_PURPOSE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useAuthStore } from '../../stores/auth'

const rows = ref<InventoryItem[]>([])
const loading = ref(false)
const keyword = ref('')
const auth = useAuthStore()
const canDelete = computed(() => auth.hasAccess('inventory.item.delete'))
/** 删除时“有记录”的物品只是隐藏（停用）；默认不显示已隐藏的，勾上可以看到并恢复 */
const showHidden = ref(false)

// 名称 / 规格 / 品牌 / 编码 / 分类 都能搜，也支持拼音（全拼或首字母，如 bxm = 保鲜膜）
const shown = computed(() => rows.value.filter((r) => (showHidden.value || r.status === 'ACTIVE') && itemMatches(r, keyword.value)))
const hiddenCount = computed(() => rows.value.filter((r) => r.status !== 'ACTIVE').length)

/** 已有的分类（给“分类”输入框做下拉候选，没有的直接输入就是新分类） */
const categoryOptions = computed(() => [...new Set(rows.value.map((r) => r.category?.trim()).filter((c): c is string => !!c))].sort().map((c) => ({ label: c, value: c })))

const formVisible = ref(false)
const editingRow = ref<InventoryItem | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  unit: '',
  spec: '',
  brand: '',
  referencePrice: null as number | null,
  category: '',
  purpose: 'LOGISTICS' as InventoryItem['purpose'],
  safetyStockThreshold: null as number | null,
  shelfLifeDays: null as number | null,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await inventoryItemApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', unit: '', spec: '', brand: '', referencePrice: null, category: '', purpose: 'LOGISTICS', safetyStockThreshold: null, shelfLifeDays: null, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: InventoryItem) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    unit: row.unit,
    spec: row.spec ?? '',
    brand: row.brand ?? '',
    referencePrice: row.referencePrice === null ? null : Number(row.referencePrice),
    category: row.category ?? '',
    purpose: row.purpose,
    safetyStockThreshold: row.safetyStockThreshold,
    shelfLifeDays: row.shelfLifeDays,
    status: row.status,
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await inventoryItemApi.update(editingRow.value.id, {
        name: model.value.name,
        unit: model.value.unit.trim(),
        category: model.value.category || undefined,
        spec: model.value.spec.trim(),
        brand: model.value.brand.trim(),
        referencePrice: model.value.referencePrice,
        safetyStockThreshold: model.value.safetyStockThreshold ?? undefined,
        shelfLifeDays: model.value.shelfLifeDays ?? undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('物品已更新')
    } else {
      await inventoryItemApi.create({
        name: model.value.name,
        unit: model.value.unit,
        spec: model.value.spec.trim() || undefined,
        brand: model.value.brand.trim() || undefined,
        referencePrice: model.value.referencePrice ?? undefined,
        category: model.value.category || undefined,
        purpose: model.value.purpose,
        safetyStockThreshold: model.value.safetyStockThreshold ?? undefined,
        shelfLifeDays: model.value.shelfLifeDays ?? undefined,
      })
      message.success('物品已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const money = (v: string | number | null) => (v === null || v === undefined ? '-' : String(Number(v)))

const columns: DataTableColumns<InventoryItem> = [
  { key: 'name', title: '物品名称', width: 150, fixed: 'left' },
  { key: 'spec', title: '规格/型号/尺寸', width: 190, ellipsis: { tooltip: true }, render: (row) => row.spec ?? '-' },
  { key: 'brand', title: '品牌', width: 90, render: (row) => row.brand ?? '-' },
  { key: 'unit', title: '单位', width: 70 },
  { key: 'referencePrice', title: '参考单价', width: 90, render: (row) => money(row.referencePrice) },
  { key: 'code', title: '编码', width: 90 },
  { key: 'category', title: '分类', width: 100, render: (row) => row.category ?? '-' },
  { key: 'purpose', title: '用途', width: 110, render: (row) => WAREHOUSE_PURPOSE_LABEL_MAP[row.purpose] },
  { key: 'safetyStockThreshold', title: '安全库存阈值', width: 110, render: (row) => row.safetyStockThreshold ?? '不预警' },
  { key: 'shelfLifeDays', title: '保质期(天)', width: 100, render: (row) => row.shelfLifeDays ?? '不追踪' },
  { key: 'status', title: '状态', width: 80, render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: canDelete.value ? 130 : 80,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 6, wrap: false }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          ...(canDelete.value ? [h(NButton, { size: 'small', type: 'error', secondary: true, onClick: () => askDelete(row) }, { default: () => '删除' })] : []),
        ],
      }),
  },
]

// ---------------- 删除 ----------------
// 没库存没记录 → 永久删除；有记录没库存 → 隐藏（停用，可恢复）；还有库存 → 库管不能删，管理员只能隐藏
async function askDelete(row: InventoryItem) {
  const check = await inventoryItemApi.deleteCheck(row.id)
  if (check.outcome === 'BLOCKED') {
    dialog.warning({ title: `不能删除“${row.name}”`, content: check.reason, positiveText: '我知道了' })
    return
  }
  dialog.warning({
    title: check.outcome === 'DELETE' ? `删除“${row.name}”` : `隐藏“${row.name}”`,
    content: check.reason,
    positiveText: check.outcome === 'DELETE' ? '确认删除' : '确认隐藏',
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await inventoryItemApi.remove(row.id)
      message.success(r.message)
      await fetchList()
    },
  })
}

// ---------------- Excel 导入 ----------------
const importVisible = ref(false)
const importing = ref(false)
const parsing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref<ItemImportPreview | null>(null)
const importRows = ref<ItemImportPreviewRow[]>([])
const checkedKeys = ref<number[]>([])
const importOpts = ref({ purpose: 'LOGISTICS' as InventoryItem['purpose'], category: '', updateExisting: 'skip' as 'skip' | 'update' })

const STATUS_TAG: Record<ItemImportStatus | 'READY', { label: string; type: 'success' | 'info' | 'warning' | 'default' | 'error' }> = {
  NEW: { label: '新增', type: 'success' },
  READY: { label: '新增（已补单位）', type: 'success' },
  EXISTS: { label: '系统已有', type: 'info' },
  DUP_IN_FILE: { label: '表内重复', type: 'default' },
  MISSING_UNIT: { label: '缺单位', type: 'warning' },
}
/** 缺单位的行，补上单位后按“新增”算 */
const effStatus = (r: ItemImportPreviewRow): ItemImportStatus | 'READY' => (r.status === 'MISSING_UNIT' && r.unit ? 'READY' : r.status)
const canCheck = (r: ItemImportPreviewRow) => {
  const s = effStatus(r)
  return s === 'NEW' || s === 'READY' || (s === 'EXISTS' && importOpts.value.updateExisting === 'update')
}

function openImport() {
  preview.value = null
  importRows.value = []
  checkedKeys.value = []
  importOpts.value = { purpose: 'LOGISTICS', category: '', updateExisting: 'skip' }
  importVisible.value = true
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.xlsx$/i.test(file.name)) return void message.error('请上传 Excel（.xlsx）文件；如果是 .xls 请先在 Excel/WPS 里另存为 .xlsx')
  parsing.value = true
  try {
    preview.value = await inventoryItemApi.importPreview(file)
    importRows.value = preview.value.rows
    checkedKeys.value = importRows.value.filter((r) => r.status === 'NEW').map((r) => r.rowNo)
  } finally {
    parsing.value = false
  }
}

function onUpdateModeChange() {
  // 切到“补充已有”时，把已有的也勾上；切回“跳过”时取消
  const exists = importRows.value.filter((r) => r.status === 'EXISTS').map((r) => r.rowNo)
  checkedKeys.value =
    importOpts.value.updateExisting === 'update' ? [...new Set([...checkedKeys.value, ...exists])] : checkedKeys.value.filter((k) => !exists.includes(k))
}

const counts = computed(() => {
  const c = { NEW: 0, EXISTS: 0, DUP_IN_FILE: 0, MISSING_UNIT: 0 }
  for (const r of importRows.value) c[r.status] += 1
  return c
})

const importColumns: DataTableColumns<ItemImportPreviewRow> = [
  { type: 'selection', disabled: (r) => !canCheck(r) },
  { key: 'rowNo', title: '表里行号', width: 80 },
  { key: 'name', title: '物品名称', width: 150 },
  { key: 'spec', title: '规格/型号/尺寸', width: 190, ellipsis: { tooltip: true }, render: (r) => r.spec ?? '-' },
  { key: 'brand', title: '品牌', width: 90, render: (r) => r.brand ?? '-' },
  {
    key: 'unit',
    title: '单位',
    width: 100,
    render: (r) =>
      r.status === 'MISSING_UNIT' || r.status === 'NEW'
        ? h(NInput, { size: 'small', value: r.unit ?? '', placeholder: '填单位', onUpdateValue: (v: string) => { r.unit = v.trim() || null; if (r.unit && r.status === 'MISSING_UNIT' && !checkedKeys.value.includes(r.rowNo)) checkedKeys.value = [...checkedKeys.value, r.rowNo] } })
        : (r.unit ?? '-'),
  },
  { key: 'referencePrice', title: '参考单价', width: 90, render: (r) => money(r.referencePrice) },
  {
    key: 'status',
    title: '状态',
    width: 130,
    render: (r) => h(NTag, { size: 'small', type: STATUS_TAG[effStatus(r)].type }, { default: () => STATUS_TAG[effStatus(r)].label }),
  },
  { key: 'message', title: '说明', minWidth: 200, ellipsis: { tooltip: true }, render: (r) => (effStatus(r) === 'READY' ? '补上了单位，将新增' : r.message) },
]

const selectedRows = computed(() => importRows.value.filter((r) => checkedKeys.value.includes(r.rowNo) && canCheck(r)))

async function handleImport() {
  const items = selectedRows.value
  if (items.length === 0) return void message.warning('没有勾选要导入的物品')
  importing.value = true
  try {
    const res = await inventoryItemApi.importCommit({
      items: items.map(({ rowNo, name, spec, brand, unit, referencePrice }) => ({ rowNo, name, spec, brand, unit, referencePrice })),
      purpose: importOpts.value.purpose,
      category: importOpts.value.category.trim() || undefined,
      updateExisting: importOpts.value.updateExisting === 'update',
    })
    importVisible.value = false
    await fetchList()
    dialog.success({
      title: '导入完成',
      content: `新增 ${res.created} 个物品${res.updated ? `，补充更新 ${res.updated} 个已有物品` : ''}${res.skipped ? `，跳过 ${res.skipped} 个（${res.skippedDetail.slice(0, 5).map((s) => `第 ${s.rowNo} 行 ${s.name}`).join('、')}${res.skipped > 5 ? '…' : ''}）` : ''}。物品编码已自动生成（WP0001 这样的格式）。`,
      positiveText: '知道了',
    })
  } finally {
    importing.value = false
  }
}

onMounted(fetchList)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <n-space align="center">
        <n-input v-model:value="keyword" clearable placeholder="🔍 搜索名称 / 规格 / 品牌 / 编码 / 拼音首字母" style="width: min(360px, 94vw)" />
        <n-checkbox v-if="hiddenCount > 0" v-model:checked="showHidden">显示已隐藏/停用的（{{ hiddenCount }}）</n-checkbox>
      </n-space>
      <n-space>
        <n-button @click="openImport">从 Excel 导入</n-button>
        <n-button type="primary" @click="openCreateModal">新建物品</n-button>
      </n-space>
    </n-space>
    <n-data-table :columns="columns" :data="shown" :loading="loading" :row-key="(r: InventoryItem) => r.id" :scroll-x="1300" />

    <!-- 新建/编辑 -->
    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑物品' : '新建物品'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="110">
          <n-form-item label="编码">
            <span v-if="editingRow" style="color: #666">{{ model.code }}（自动生成，不能修改）</span>
            <span v-else style="color: #999">保存后自动生成（WP0001 这样的格式），不用填写</span>
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="规格/型号/尺寸"><n-input v-model:value="model.spec" placeholder="如 100*120、27卷/箱" /></n-form-item>
          <n-form-item label="品牌"><n-input v-model:value="model.brand" /></n-form-item>
          <n-form-item label="计量单位" path="unit" :rule="{ required: true, message: '请输入计量单位' }">
            <n-input v-model:value="model.unit" placeholder="如 kg/件/箱/瓶" />
            <template v-if="editingRow" #feedback>只改单位的名称，库存里已有的数量不会换算（比如“箱”改成“件”，数量不变）。</template>
          </n-form-item>
          <n-form-item label="参考单价"><n-input-number v-model:value="model.referencePrice" :min="0" :precision="4" :show-button="false" style="width: 100%" placeholder="按计量单位计，仅供申购参考" /></n-form-item>
          <n-form-item label="分类">
            <n-auto-complete v-model:value="model.category" :options="categoryOptions" clearable placeholder="选已有分类，或直接输入新分类（如 保洁耗材）" />
            <template #feedback>没有单独的“分类设置”页：在这里输入就会产生新分类，下次新建物品时可以直接选。</template>
          </n-form-item>
          <n-form-item v-if="!editingRow" label="用途">
            <n-select
              v-model:value="model.purpose"
              :options="[
                { label: '经营性', value: 'OPERATING' },
                { label: '后勤/办公用品', value: 'LOGISTICS' },
              ]"
            />
          </n-form-item>
          <n-form-item label="安全库存阈值"><n-input-number v-model:value="model.safetyStockThreshold" :min="0" style="width: 100%" placeholder="留空=不预警" /></n-form-item>
          <n-form-item label="保质期(天)"><n-input-number v-model:value="model.shelfLifeDays" :min="1" style="width: 100%" placeholder="留空=不追踪效期" /></n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '启用', value: 'ACTIVE' },
                { label: '停用', value: 'INACTIVE' },
              ]"
            />
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

    <!-- Excel 导入 -->
    <n-modal :mask-closable="false" :show="importVisible" @update:show="(v) => (importVisible = v)">
      <n-card title="从 Excel 导入物品" style="width: min(1000px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <input ref="fileInput" type="file" accept=".xlsx" style="display: none" @change="onFileChosen" />
        <n-space align="center" style="margin-bottom: 10px">
          <n-button type="primary" :loading="parsing" @click="fileInput?.click()">{{ preview ? '重新选择文件' : '选择 Excel 文件（.xlsx）' }}</n-button>
          <span style="color: #888; font-size: 12px">直接用现在在用的采购申购表即可，不用改格式</span>
        </n-space>

        <template v-if="preview">
          <n-alert type="info" :show-icon="false" style="margin-bottom: 10px">
            从“{{ preview.sheetName }}”识别出 <b>{{ importRows.length }}</b> 个物品：新增 {{ counts.NEW }}、系统已有 {{ counts.EXISTS }}、表内重复 {{ counts.DUP_IN_FILE }}、缺单位 {{ counts.MISSING_UNIT }}。
            <template v-if="preview.ignoredColumns.length">表里的“{{ preview.ignoredColumns.join('、') }}”属于具体采购单的内容，物品资料用不上，已忽略。</template>
          </n-alert>
          <n-space align="center" :size="16" style="margin-bottom: 10px">
            <n-space align="center" :size="6">
              <span>用途</span>
              <n-select v-model:value="importOpts.purpose" style="width: 150px" :options="[{ label: '后勤/办公用品', value: 'LOGISTICS' }, { label: '经营性（食材、服务耗材）', value: 'OPERATING' }]" />
            </n-space>
            <n-space align="center" :size="6">
              <span>分类（可不填）</span>
              <n-input v-model:value="importOpts.category" style="width: 150px" placeholder="如 保洁耗材" />
            </n-space>
            <n-radio-group v-model:value="importOpts.updateExisting" @update:value="onUpdateModeChange">
              <n-space :size="10">
                <n-radio value="skip">系统已有的跳过</n-radio>
                <n-radio value="update">系统已有的补充品牌和参考单价</n-radio>
              </n-space>
            </n-radio-group>
          </n-space>
          <n-data-table
            :columns="importColumns"
            :data="importRows"
            :row-key="(r: ItemImportPreviewRow) => r.rowNo"
            v-model:checked-row-keys="checkedKeys"
            :scroll-x="980"
            :max-height="380"
            size="small"
          />
          <div style="margin-top: 6px; color: #999; font-size: 12px">同名但规格不同的算两个物品（如垃圾袋 100*120 和 100*80）。缺单位的行请在表格里补上单位。物品编码自动生成。</div>
        </template>
        <n-empty v-else description="先选择 Excel 文件，系统会识别并让你核对后再导入" style="padding: 24px 0" />

        <template #footer>
          <n-space justify="end">
            <n-button @click="importVisible = false">取消</n-button>
            <n-button type="primary" :loading="importing" :disabled="selectedRows.length === 0" @click="handleImport">导入勾选的 {{ selectedRows.length }} 个物品</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
