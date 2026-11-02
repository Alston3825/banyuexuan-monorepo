<script setup lang="ts">
/**
 * 满意度调查：客户住满第 5 / 15 / 25 天各填一张纸质《客户满意度调查表》，客服不定期收回后拍照上传——
 * AI 读出每个评分项打勾的分值和手写意见，人工对照原图核对、确认后计入统计；
 * “统计分析”看各项平均分/满意率/分布，“意见汇总”看客户手写的建议和表扬（可 AI 归类）。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NCard, NDataTable, NDatePicker, NInput, NModal, NRadioButton, NRadioGroup, NSelect, NSpace, NTabPane, NTabs, NTag, type DataTableColumns } from 'naive-ui'
import { satisfactionApi } from '../../api/modules/satisfaction.api'
import type { Survey, SurveySpecs } from '../../api/types/satisfaction'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'
import SurveyReviewDialog from '../../components/satisfaction/SurveyReviewDialog.vue'
import SurveyStatsPanel from '../../components/satisfaction/SurveyStatsPanel.vue'
import SurveyCommentsPanel from '../../components/satisfaction/SurveyCommentsPanel.vue'

const auth = useAuthStore()
const canCreate = computed(() => auth.hasAccess('satisfaction.survey.create'))
const canDelete = computed(() => auth.hasAccess('satisfaction.survey.delete'))

const specs = ref<SurveySpecs | null>(null)
const tab = ref<'list' | 'stats' | 'comments'>('list')
const rows = ref<Survey[]>([])
const loading = ref(false)
const formNo = ref<number | null>(null)
const status = ref<string | null>(null)
const keyword = ref('')
const range = ref<[number, number] | null>(null)

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const formOptions = computed(() => (specs.value?.forms ?? []).map((f) => ({ label: `第 ${f.day} 天表（表${'一二三'[f.formNo - 1]}）`, value: f.formNo })))
const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayOf = (n: number) => specs.value?.forms.find((f) => f.formNo === n)?.day ?? n

let seq = 0
async function load() {
  const my = ++seq
  loading.value = true
  try {
    const res = await satisfactionApi.list({
      formNo: formNo.value ?? undefined,
      status: status.value ?? undefined,
      keyword: keyword.value.trim() || undefined,
      from: range.value ? ymd(range.value[0]) : undefined,
      to: range.value ? ymd(range.value[1]) : undefined,
    })
    if (my === seq) rows.value = res
  } finally {
    if (my === seq) loading.value = false
  }
}
let t: ReturnType<typeof setTimeout> | null = null
watch([formNo, status, keyword, range], () => {
  if (t) clearTimeout(t)
  t = setTimeout(load, 300)
})
onMounted(async () => {
  specs.value = await satisfactionApi.specs()
  await load()
})

/** 这份表的平均分（已填的评分项） */
function avgOf(r: Survey): string {
  const vs = Object.values(r.scores ?? {})
  return vs.length ? (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1) : '-'
}
const totalOf = (r: Survey) => specs.value?.forms.find((f) => f.formNo === r.formNo)?.groups.reduce((a, g) => a + g.items.length, 0) ?? 0
const statusTag = (r: Survey) => {
  if (r.extractStatus === 'PENDING' || r.extractStatus === 'RUNNING') return { text: '识别中…', type: 'info' as const }
  if (r.extractStatus === 'FAILED' && r.status === 'DRAFT') return { text: '识别失败', type: 'error' as const }
  return r.status === 'CONFIRMED' ? { text: '已确认', type: 'success' as const } : { text: '待核对', type: 'warning' as const }
}
const nameOf = (r: Survey) => r.customer?.name ?? r.customerName ?? '（未填姓名）'
const dateOf = (r: Survey) => (r.surveyDate ? r.surveyDate.slice(0, 10) : '-')

// ---------------- 上传 ----------------
const uploadShow = ref(false)
const upForm = ref<number>(1)
const upFiles = ref<File[]>([])
const uploading = ref(false)
function openUpload() {
  upForm.value = 1
  upFiles.value = []
  uploadShow.value = true
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  upFiles.value = [...upFiles.value, ...(input.files ?? [])]
  input.value = ''
}
async function submitUpload(manual = false) {
  if (!manual && upFiles.value.length === 0) {
    message.error('请先选择或拍摄纸质调查表的照片')
    return
  }
  uploading.value = true
  try {
    const s = await satisfactionApi.create(upForm.value, manual ? [] : upFiles.value)
    uploadShow.value = false
    await load()
    openReview(s.id)
  } finally {
    uploading.value = false
  }
}

// ---------------- 核对 ----------------
const reviewShow = ref(false)
const reviewId = ref<string | null>(null)
function openReview(id: string) {
  reviewId.value = id
  reviewShow.value = true
}
function askDelete(r: Survey) {
  dialog.warning({
    title: '删除这份调查？',
    content: `${nameOf(r)} 的第 ${dayOf(r.formNo)} 天调查表（含照片）会被永久删除，已计入的统计也会去掉。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await satisfactionApi.remove(r.id)
      message.success('已删除')
      await load()
    },
  })
}

const columns: DataTableColumns<Survey> = [
  { key: 'surveyDate', title: '填写日期', width: 100, render: dateOf },
  { key: 'customer', title: '客户', width: 110, render: (r) => h('b', nameOf(r)) },
  { key: 'roomNo', title: '房号', width: 70, render: (r) => r.roomNo ?? '-' },
  { key: 'formNo', title: '调查表', width: 100, render: (r) => `第 ${dayOf(r.formNo)} 天` },
  { key: 'stewardName', title: '管家', width: 90, render: (r) => r.stewardName ?? '-' },
  { key: 'avg', title: '平均分', width: 90, render: (r) => `${avgOf(r)}（${Object.keys(r.scores ?? {}).length}/${totalOf(r)}项）` },
  { key: 'status', title: '状态', width: 90, render: (r) => h(NTag, { size: 'small', type: statusTag(r).type, bordered: false }, { default: () => statusTag(r).text }) },
  {
    key: 'actions',
    title: '操作',
    width: 140,
    fixed: 'right',
    render: (r) =>
      h(NSpace, { size: 6, wrap: false }, {
        default: () => [
          h(NButton, { size: 'small', type: r.status === 'DRAFT' ? 'primary' : 'default', onClick: () => openReview(r.id) }, { default: () => (r.status === 'DRAFT' ? '核对' : '查看') }),
          ...(canDelete.value ? [h(NButton, { size: 'small', type: 'error', secondary: true, onClick: () => askDelete(r) }, { default: () => '删除' })] : []),
        ],
      }),
  },
]
</script>

<template>
  <div>
    <n-tabs v-model:value="tab" type="line" animated>
      <n-tab-pane name="list" tab="调查记录">
        <n-space justify="space-between" style="margin-bottom: 12px" :wrap="true">
          <n-space :wrap="true" align="center">
            <n-input v-model:value="keyword" clearable placeholder="🔍 搜索客户 / 房号 / 管家 / 意见内容" style="width: min(280px, 94vw)" />
            <n-select v-model:value="formNo" :options="formOptions" clearable placeholder="全部调查表" style="width: min(190px, 94vw)" />
            <n-select v-model:value="status" :options="[{ label: '待核对', value: 'DRAFT' }, { label: '已确认', value: 'CONFIRMED' }]" clearable placeholder="全部状态" style="width: min(140px, 94vw)" />
            <n-date-picker v-model:value="range" type="daterange" clearable style="width: min(280px, 94vw)" />
          </n-space>
          <n-button v-if="canCreate" type="primary" @click="openUpload">＋ 上传纸质调查表</n-button>
        </n-space>

        <template v-if="isMobile">
          <div v-if="!loading && rows.length === 0" class="sv-empty">还没有调查记录，点右上角“上传纸质调查表”</div>
          <div v-for="r in rows" :key="r.id" class="sv-card">
            <div class="sv-top"><b>{{ nameOf(r) }}</b><n-tag size="small" :type="statusTag(r).type" :bordered="false">{{ statusTag(r).text }}</n-tag></div>
            <div class="sv-sub">第 {{ dayOf(r.formNo) }} 天表 · {{ dateOf(r) }}<span v-if="r.roomNo"> · {{ r.roomNo }} 房</span><span v-if="r.stewardName"> · 管家 {{ r.stewardName }}</span></div>
            <div class="sv-sub">平均分 <b>{{ avgOf(r) }}</b>（{{ Object.keys(r.scores ?? {}).length }}/{{ totalOf(r) }} 项）</div>
            <n-space style="margin-top: 8px" :size="8">
              <n-button size="small" :type="r.status === 'DRAFT' ? 'primary' : 'default'" @click="openReview(r.id)">{{ r.status === 'DRAFT' ? '核对' : '查看' }}</n-button>
              <n-button v-if="canDelete" size="small" type="error" secondary @click="askDelete(r)">删除</n-button>
            </n-space>
          </div>
        </template>
        <n-data-table v-else :columns="columns" :data="rows" :loading="loading" :row-key="(r: Survey) => r.id" :pagination="{ pageSize: 20 }" :scroll-x="780" />
      </n-tab-pane>

      <n-tab-pane name="stats" tab="统计分析" display-directive="show:lazy">
        <SurveyStatsPanel :form-options="formOptions" @go-pending="(tab = 'list'), (status = 'DRAFT')" />
      </n-tab-pane>
      <n-tab-pane name="comments" tab="意见汇总" display-directive="show:lazy">
        <SurveyCommentsPanel :form-options="formOptions" />
      </n-tab-pane>
    </n-tabs>

    <n-modal :mask-closable="false" :show="uploadShow" @update:show="(v: boolean) => (uploadShow = v)">
      <n-card title="上传纸质调查表" style="width: min(520px, 96vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="uploadShow = false">
        <div class="up-label">这是第几张表？（表头标题里有“一/二/三”）</div>
        <n-radio-group v-model:value="upForm" size="large" style="margin-bottom: 14px">
          <n-radio-button v-for="o in formOptions" :key="o.value" :value="o.value">{{ o.label }}</n-radio-button>
        </n-radio-group>
        <div class="up-label">拍照或选择照片（多张一起传；可以一次选好几张）</div>
        <label class="up-pick">
          <input type="file" accept="image/*,.heic,.heif,application/pdf" multiple hidden @change="onPick" />
          <n-button tag="span" size="large" style="width: 100%">📷 拍照 / 选择照片</n-button>
        </label>
        <div v-for="(f, i) in upFiles" :key="i" class="up-file">{{ f.name }}<a @click="upFiles.splice(i, 1)">移除</a></div>
        <div class="up-tip">上传后 AI 会自动读出每一项的打勾分值和手写意见（约半分钟），再由你对照原图核对、确认。一次上传一位客户的一张表。</div>
        <template #footer>
          <n-space justify="space-between">
            <n-button quaternary :loading="uploading" @click="submitUpload(true)">不拍照，手工录入</n-button>
            <n-space>
              <n-button @click="uploadShow = false">取消</n-button>
              <n-button type="primary" :loading="uploading" @click="submitUpload(false)">上传并识别</n-button>
            </n-space>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <SurveyReviewDialog v-model:show="reviewShow" :survey-id="reviewId" :specs="specs" @changed="load" />
  </div>
</template>

<style scoped>
.sv-card {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.sv-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
}
.sv-sub {
  font-size: 13px;
  color: #888;
  margin-top: 2px;
}
.sv-empty {
  color: #999;
  text-align: center;
  padding: 30px 0;
}
.up-label {
  margin-bottom: 6px;
  font-weight: 600;
}
.up-pick {
  display: block;
  margin-bottom: 8px;
}
.up-file {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 2px 0;
}
.up-file a {
  color: #d03050;
  cursor: pointer;
}
.up-tip {
  margin-top: 10px;
  font-size: 12px;
  color: #888;
}
</style>
