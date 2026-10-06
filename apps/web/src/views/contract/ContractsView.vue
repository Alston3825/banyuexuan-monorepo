<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NTag, NUpload, NUploadDragger, NText, NSpin,
  type DataTableColumns, type UploadFileInfo,
} from 'naive-ui'
import { contractApi } from '../../api/modules/contract.api'
import { storeApi } from '../../api/modules/store.api'
import { CARE_MODE_LABEL, ORIENTATION_LABEL, type ContractListItem } from '../../api/types/contract'
import { message } from '../../utils/discrete-api'
import { toMajorUnits } from '../../utils/money'

const route = useRoute()
const router = useRouter()

/** 页面上的五种"业务状态"：由合同状态 + 有没有排房 + AI 识别进度合成 */
type Tab = 'ALL' | 'REVIEW' | 'UNASSIGNED' | 'ASSIGNED' | 'VOIDED'
const tab = ref<Tab>('ALL')
const keyword = ref('')
const rows = ref<ContractListItem[]>([])
const loading = ref(false)

const tabOptions: { label: string; value: Tab }[] = [
  { label: '全部', value: 'ALL' },
  { label: '待核对', value: 'REVIEW' },
  { label: '待排房', value: 'UNASSIGNED' },
  { label: '已排房', value: 'ASSIGNED' },
  { label: '已作废', value: 'VOIDED' },
]

async function fetchList(silent = false) {
  if (!silent) loading.value = true
  try {
    const params: Record<string, unknown> = { keyword: keyword.value.trim() || undefined }
    if (tab.value === 'REVIEW') params.status = 'PENDING_REVIEW'
    else if (tab.value === 'UNASSIGNED') params.unassigned = true
    else if (tab.value === 'ASSIGNED') params.status = 'ACTIVE'
    else if (tab.value === 'VOIDED') params.status = 'VOIDED'
    const list = await contractApi.list(params)
    rows.value = tab.value === 'ASSIGNED' ? list.filter((c) => c.roomOccupancies.length > 0) : list
  } finally {
    loading.value = false
  }
}

// AI 识别是后台任务，有合同还在识别时每 4 秒静默刷新一次
let timer: number | undefined
function schedulePolling() {
  window.clearTimeout(timer)
  if (rows.value.some((c) => c.extractStatus === 'PENDING' || c.extractStatus === 'RUNNING')) {
    timer = window.setTimeout(async () => {
      await fetchList(true)
      schedulePolling()
    }, 4000)
  }
}
watch(rows, schedulePolling)
onBeforeUnmount(() => window.clearTimeout(timer))

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '-'
}

function renderStatus(row: ContractListItem) {
  if (row.status === 'PENDING_REVIEW') {
    if (row.extractStatus === 'PENDING' || row.extractStatus === 'RUNNING') {
      return h(NSpace, { size: 4, align: 'center' }, { default: () => [h(NSpin, { size: 14 }), h(NTag, { type: 'info', round: true, size: 'small' }, { default: () => 'AI 识别中' })] })
    }
    if (row.extractStatus === 'FAILED') return h(NTag, { type: 'error', round: true, size: 'small' }, { default: () => '识别失败' })
    return h(NTag, { type: 'warning', round: true, size: 'small' }, { default: () => '待核对' })
  }
  if (row.status === 'ACTIVE') {
    return row.roomOccupancies.length > 0
      ? h(NTag, { type: 'success', round: true, size: 'small' }, { default: () => '已排房' })
      : h(NTag, { type: 'primary', round: true, size: 'small' }, { default: () => '待排房' })
  }
  if (row.status === 'VOIDED') return h(NTag, { round: true, size: 'small' }, { default: () => '已作废' })
  return h(NTag, { round: true, size: 'small' }, { default: () => row.status })
}

const columns: DataTableColumns<ContractListItem> = [
  {
    key: 'paperNo',
    title: '合同编号',
    width: 130,
    render: (row) =>
      h('a', { style: 'color:#2080f0;cursor:pointer', onClick: () => router.push(`/contract/records/${row.id}`) }, row.paperNo || `（未填）${row.contractNo.slice(-6)}`),
  },
  { key: 'customer', title: '客户', width: 100, render: (row) => row.customer?.name ?? row.clientName ?? '-' },
  { key: 'signedDate', title: '签约日期', width: 105, render: (row) => day(row.signedDate) },
  { key: 'signer', title: '签单人', width: 90, render: (row) => row.signer?.realName ?? '-' },
  {
    key: 'room',
    title: '房型',
    width: 150,
    render: (row) => [row.roomType?.name ?? row.roomTypeText ?? '-', row.orientation ? ` · ${ORIENTATION_LABEL[row.orientation]}` : ''].join(''),
  },
  { key: 'careMode', title: '护理模式', width: 85, render: (row) => (row.careMode ? CARE_MODE_LABEL[row.careMode] : '-') },
  {
    key: 'days',
    title: '天数',
    width: 85,
    render: (row) => (row.inHouseDays ? `${row.inHouseDays}${row.homeServiceDays ? `+${row.homeServiceDays}` : ''}` : '-'),
  },
  { key: 'estimatedCheckIn', title: '预估入住', width: 105, render: (row) => day(row.estimatedCheckIn) },
  { key: 'estimatedCheckOut', title: '预估离店', width: 105, render: (row) => day(row.estimatedCheckOut) },
  { key: 'amount', title: '套餐金额（元）', width: 120, render: (row) => (row.amount ? toMajorUnits(row.amount)!.toLocaleString() : '-') },
  { key: 'status', title: '状态', width: 110, render: renderStatus },
  {
    key: 'actions',
    title: '操作',
    width: 130,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 6 }, {
        default: () => [
          h(NButton, { size: 'small', type: row.status === 'PENDING_REVIEW' ? 'primary' : 'default', onClick: () => router.push(`/contract/records/${row.id}`) }, { default: () => (row.status === 'PENDING_REVIEW' ? '核对' : '查看') }),
        ],
      }),
  },
]

// ---------------- 上传 ----------------
const uploadVisible = ref(false)
const uploadFiles = ref<UploadFileInfo[]>([])
const uploading = ref(false)
const storeOptions = ref<{ label: string; value: string }[]>([])
const uploadStoreId = ref<string | null>(null)

async function ensureStores() {
  if (storeOptions.value.length > 0) return
  const stores = await storeApi.list()
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  uploadStoreId.value = stores[0]?.id ?? null
}

async function openUpload() {
  await ensureStores()
  uploadFiles.value = []
  uploadVisible.value = true
}

async function handleUpload() {
  const files = uploadFiles.value.map((f) => f.file).filter((f): f is File => !!f)
  if (files.length === 0) {
    message.error('请先选择合同文件（PDF 或照片）')
    return
  }
  uploading.value = true
  try {
    const created = await contractApi.upload(files, uploadStoreId.value ?? undefined)
    message.success('上传成功，AI 正在识别，稍后即可核对')
    uploadVisible.value = false
    router.push(`/contract/records/${created.id}`)
  } finally {
    uploading.value = false
  }
}

async function handleManual() {
  await ensureStores()
  const created = await contractApi.createManual(uploadStoreId.value ?? undefined)
  router.push(`/contract/records/${created.id}`)
}

onMounted(async () => {
  await fetchList()
  if (route.query.upload === '1') {
    router.replace({ path: route.path })
    await openUpload()
  }
})

const emptyHint = computed(() => (tab.value === 'UNASSIGNED' ? '没有待排房的合同' : '还没有合同，点右上角“上传合同”开始'))
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" :wrap="true">
      <n-space :wrap="true">
        <n-space :size="4">
          <n-button v-for="t in tabOptions" :key="t.value" size="small" :type="tab === t.value ? 'primary' : 'default'" :secondary="tab !== t.value" @click="(tab = t.value), fetchList()">
            {{ t.label }}
          </n-button>
        </n-space>
        <n-input v-model:value="keyword" clearable placeholder="搜索 合同编号 / 客户姓名 / 手机号" style="width: min(260px, 90vw)" @keyup.enter="fetchList()" @clear="fetchList()" />
        <n-button @click="fetchList()">搜索</n-button>
      </n-space>
      <n-space>
        <n-button @click="handleManual">手工新建</n-button>
        <n-button type="primary" @click="openUpload">上传合同</n-button>
      </n-space>
    </n-space>

    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: ContractListItem) => r.id" :scroll-x="1500" :bordered="false">
      <template #empty>{{ emptyHint }}</template>
    </n-data-table>

    <n-modal :show="uploadVisible" @update:show="(v) => (uploadVisible = v)">
      <n-card title="上传纸质合同" style="width: min(560px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="70">
          <n-form-item label="门店"><n-select v-model:value="uploadStoreId" :options="storeOptions" /></n-form-item>
        </n-form>
        <n-upload v-model:file-list="uploadFiles" multiple accept=".pdf,image/jpeg,image/png" :default-upload="false" :show-file-list="true" list-type="text">
          <n-upload-dragger>
            <div style="padding: 12px 0">
              <n-text style="font-size: 15px">点击或拖拽文件到这里</n-text>
              <div style="margin-top: 6px; color: #888; font-size: 12px; line-height: 1.6">
                一份合同可以传一个 PDF，或同一份合同的多张照片（按页码顺序选）。<br />
                手机上点这里可直接拍照。上传后 AI 会自动识别，约 1 分钟。
              </div>
            </div>
          </n-upload-dragger>
        </n-upload>
        <template #footer>
          <n-space justify="end">
            <n-button @click="uploadVisible = false">取消</n-button>
            <n-button type="primary" :loading="uploading" @click="handleUpload">上传并识别</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
