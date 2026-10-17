<script setup lang="ts">
/**
 * 拍照导入纸质《产妇常规护理计划》统计表：这张纸一直沿用、每天往上写新记录，
 * 所以每天拍一张整页照片 → AI 把纸上所有记录读出来 → 系统和已经登记的服务执行记录比对，
 * 只把“新写的”列出来让人核对（日期/数值可以直接改）→ 一键登记。已经登记过的自动跳过，不会重复。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NCheckbox, NDatePicker, NInput, NInputNumber, NModal, NSelect, NSpace, NSpin, NSwitch, NTag } from 'naive-ui'
import { careDocumentApi, careServiceLogApi } from '../../api/modules/care-archive.api'
import type { SheetImportItem, SheetImportPreview } from '../../api/types/care-archive'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ show: boolean; motherProfileId: string }>()
const emit = defineEmits<{ 'update:show': [v: boolean]; done: [] }>()

type Step = 'pick' | 'working' | 'review'
const step = ref<Step>('pick')
const statusText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const docId = ref<string | null>(null)
const preview = ref<SheetImportPreview | null>(null)
const babyId = ref<string | null>(null)
const committing = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

interface Row extends SheetImportItem {
  checked: boolean
  dateTs: number | null
}
const rows = ref<Row[]>([])
const showExisting = ref(false)

const ymdOf = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const tsOf = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`).getTime() : null)

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}
onBeforeUnmount(stopPolling)

watch(
  () => props.show,
  (v) => {
    if (v) {
      step.value = 'pick'
      docId.value = null
      preview.value = null
      rows.value = []
      babyId.value = null
      showExisting.value = false
    } else stopPolling()
  },
  { immediate: true },
)

function applyPreview(p: SheetImportPreview) {
  preview.value = p
  babyId.value = p.babyProfileId
  rows.value = p.items.map((i) => ({ ...i, checked: i.status === 'NEW', dateTs: tsOf(i.date) }))
  step.value = 'review'
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  step.value = 'working'
  statusText.value = '正在上传照片…'
  try {
    const doc = await careDocumentApi.upload(files, { docType: 'CARE_PLAN', motherProfileId: props.motherProfileId })
    docId.value = doc.id
    statusText.value = 'AI 正在读取纸上的记录，一般 30～60 秒…'
    const started = Date.now()
    stopPolling()
    timer = setInterval(async () => {
      try {
        const d = await careDocumentApi.get(doc.id)
        if (d.extractStatus === 'DONE') {
          stopPolling()
          applyPreview(await careServiceLogApi.importPreview(doc.id))
        } else if (d.extractStatus === 'FAILED') {
          stopPolling()
          step.value = 'pick'
          message.error(`识别失败：${d.extractError ?? '未知原因'}，可以重新拍一张试试`)
        } else if (Date.now() - started > 6 * 60_000) {
          stopPolling()
          step.value = 'pick'
          message.error('识别超时，请稍后重试')
        }
      } catch {
        /* 偶发网络错误，下一轮再试 */
      }
    }, 2500)
  } catch {
    step.value = 'pick'
  }
}

async function changeBaby(id: string) {
  if (!docId.value) return
  applyPreview(await careServiceLogApi.importPreview(docId.value, id))
}

const fresh = computed(() => rows.value.filter((r) => r.status !== 'EXISTS'))
const existing = computed(() => rows.value.filter((r) => r.status === 'EXISTS'))
const selected = computed(() => fresh.value.filter((r) => r.checked))
const md = (iso: string) => (iso ? `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日` : '未读出日期')
const isBP = (r: Row) => r.serviceCode === 'BP'
const isWeight = (r: Row) => r.serviceCode === 'WEIGHT'

function onDate(r: Row, ts: number | null) {
  r.dateTs = ts
  r.date = ts ? ymdOf(ts) : ''
}

async function commit() {
  if (!docId.value) return
  if (selected.value.length === 0) return void message.warning('没有勾选要登记的记录')
  committing.value = true
  try {
    const res = await careServiceLogApi.importCommit({
      documentId: docId.value,
      babyProfileId: babyId.value,
      items: selected.value.map((r) => ({ serviceCode: r.serviceCode, date: r.date, time: r.time, systolic: r.systolic, diastolic: r.diastolic, heartRate: r.heartRate, weightKg: r.weightKg, doneByName: r.doneByName, clientSigned: r.clientSigned })),
    })
    message.success(`已登记 ${res.created} 条${res.skipped ? `，${res.skipped} 条已有、自动跳过` : ''}`)
    emit('update:show', false)
    emit('done')
  } finally {
    committing.value = false
  }
}
const close = () => emit('update:show', false)
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v: boolean) => emit('update:show', v)">
    <n-card title="拍照导入纸质护理计划表" style="width: min(760px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true" closable @close="close">
      <input ref="fileInput" type="file" multiple accept="image/*,.heic,.heif" style="display: none" @change="onPick" />

      <!-- 1. 选照片 -->
      <template v-if="step === 'pick'">
        <p class="si-tip">
          这张《产妇常规护理计划》纸表会一直用、每天往上写新记录。<b>每天拍一张整页照片</b>（尽量拍正、光线亮、字迹清楚）传上来，
          系统会读出纸上所有记录，<b>和已经登记的比对，只把新写的列出来</b>让你核对后一键登记；已登记过的自动跳过，不会重复。
        </p>
        <n-button type="primary" size="large" block @click="fileInput?.click()">📷 拍照 / 选择照片</n-button>
      </template>

      <!-- 2. 识别中 -->
      <div v-else-if="step === 'working'" class="si-working"><n-spin size="small" /> {{ statusText }}</div>

      <!-- 3. 核对 -->
      <template v-else-if="preview">
        <n-alert v-if="preview.header.nameMatches === false" type="warning" :show-icon="false" style="margin-bottom: 8px">
          ⚠ 纸上的姓名是「{{ preview.header.patientName }}」，和这份档案的客户「{{ preview.header.customerName }}」对不上，请确认拍的是不是这位妈妈的表。
        </n-alert>
        <n-alert type="info" :show-icon="false" style="margin-bottom: 8px">
          纸上共读到 <b>{{ preview.counts.total }}</b> 条记录：<b style="color: #18a058">新写的 {{ preview.counts.new }} 条</b>，
          系统里已有 {{ preview.counts.exists }} 条（自动跳过）<template v-if="preview.counts.invalid > 0">，<b style="color: #d03050">{{ preview.counts.invalid }} 条没读全，需要在下面补</b></template><template v-if="preview.counts.planned > 0">；另有 {{ preview.counts.planned }} 个只写了预约日期、还没测的（已忽略）</template>。
          带 <n-tag size="tiny" type="warning" :bordered="false">请核对</n-tag> 的是 AI 没把握的，<b>请对照原图检查日期和数值</b>；不对的直接在这里改，或取消勾选。
        </n-alert>
        <n-space v-if="preview.babies.length > 1" align="center" style="margin-bottom: 8px">
          <span>宝宝的项目（宣教等）记到：</span>
          <n-select :value="babyId" :options="preview.babies.map((b) => ({ label: b.label, value: b.id }))" style="width: 200px" @update:value="changeBaby" />
        </n-space>

        <div v-if="fresh.length === 0" class="si-empty">✓ 纸上的记录系统里都已经登记过了，没有新的。</div>
        <div v-for="r in fresh" :key="r.idx" class="si-row" :class="{ 'si-warn': r.uncertain || r.status === 'INVALID' }">
          <div class="si-head">
            <n-checkbox v-model:checked="r.checked" />
            <b>{{ r.name }}</b>
            <span v-if="r.subject === 'BABY'" class="si-baby">👶 宝宝</span>
            <n-tag v-if="r.uncertain" size="tiny" type="warning" :bordered="false">请核对</n-tag>
            <n-tag v-if="r.status === 'INVALID'" size="tiny" type="error" :bordered="false">{{ r.issue }}</n-tag>
          </div>
          <div class="si-grid">
            <div class="si-field"><span>日期</span><n-date-picker :value="r.dateTs" type="date" :is-date-disabled="(ts: number) => ts > Date.now()" style="width: 100%" @update:value="(v: number | null) => onDate(r, v)" /></div>
            <template v-if="isBP(r)">
              <div class="si-field"><span>高压</span><n-input-number v-model:value="r.systolic" :min="60" :max="260" :precision="0" :show-button="false" placeholder="mmHg" style="width: 100%" /></div>
              <div class="si-field"><span>低压</span><n-input-number v-model:value="r.diastolic" :min="30" :max="160" :precision="0" :show-button="false" placeholder="mmHg" style="width: 100%" /></div>
              <div class="si-field"><span>心率（选填）</span><n-input-number v-model:value="r.heartRate" :min="30" :max="220" :precision="0" :show-button="false" placeholder="次/分" style="width: 100%" /></div>
            </template>
            <div v-if="isWeight(r)" class="si-field"><span>体重 kg</span><n-input-number v-model:value="r.weightKg" :min="30" :max="200" :precision="2" :show-button="false" style="width: 100%" /></div>
            <div v-if="r.group === 'EDU'" class="si-field"><span>护理员</span><n-input v-model:value="r.doneByName" placeholder="签名" /></div>
            <div v-if="r.group === 'EDU'" class="si-field si-sw"><n-switch v-model:value="r.clientSigned" size="small" /> 客户已签字</div>
          </div>
        </div>

        <div v-if="existing.length > 0" class="si-exist">
          <a @click="showExisting = !showExisting">{{ showExisting ? '收起' : '查看' }}已登记过的 {{ existing.length }} 条（已自动跳过）</a>
          <div v-if="showExisting" class="si-chips">
            <span v-for="r in existing" :key="r.idx" class="si-chip">{{ r.name }} {{ md(r.date) }}</span>
          </div>
        </div>
      </template>

      <template #footer>
        <n-space justify="space-between" align="center" :wrap="true">
          <n-button v-if="step === 'review'" @click="fileInput?.click()">重新拍/换一张</n-button>
          <span v-else />
          <n-space>
            <n-button @click="close">关闭</n-button>
            <n-button v-if="step === 'review'" type="primary" :loading="committing" :disabled="selected.length === 0" @click="commit">登记勾选的 {{ selected.length }} 条</n-button>
          </n-space>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.si-tip {
  margin: 0 0 12px;
  line-height: 1.8;
  color: #555;
}
.si-working {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 30px 0;
  color: #666;
}
.si-empty {
  padding: 16px 0;
  color: #18a058;
}
.si-row {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fcfcfc;
}
.si-warn {
  border-color: #f0a020;
  background: #fffaf0;
}
.si-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.si-baby {
  color: #2a64b0;
  font-size: 12px;
}
.si-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 6px;
}
.si-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #777;
}
.si-sw {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  color: #555;
}
.si-exist {
  margin-top: 10px;
  font-size: 13px;
}
.si-exist a {
  color: #2a64b0;
  cursor: pointer;
}
.si-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.si-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: #eef5fc;
  color: #2a64b0;
  font-size: 12px;
}
</style>
