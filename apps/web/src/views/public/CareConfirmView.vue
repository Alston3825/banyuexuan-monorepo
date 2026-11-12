<script setup lang="ts">
/**
 * 客户的“每日服务报告”确认页（不登录，手机打开；后期微信小程序复用同一套后端接口）：
 * ① 输入自己登记的手机号后四位核验本人 → ② 查看最近 7 天的服务报告（服务项目、当班护理师、妈妈和宝宝的记录小结）
 * → ③ 逐天打分（当天整体 + 每位当班护理师）→ ④ 手写签名，或长按“确认”键确认。
 * 防止别人代点：看够时间才能确认、点击确认要长按、手写签名证据更强、护理师用过的设备上只接受手写签名。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NCheckbox, NInput, NRate, NSpin } from 'naive-ui'
import { publicConfirmApi, publicErrorText, SIGN_SHIFT_LABEL, type ReportDay, type ReportPayload } from '../../api/modules/care-sign.api'
import { getDeviceId } from '../../utils/device-id'
import BeianFooter from '../../components/BeianFooter.vue'
import SignaturePad from '../../components/care/SignaturePad.vue'

const props = defineProps<{ token: string }>()

type Step = 'loading' | 'invalid' | 'verify' | 'report'
const step = ref<Step>('loading')
const fatal = ref('')
const info = ref<{ customerName: string; storeName: string; locked: boolean; lockedUntil: string | null } | null>(null)

// ---- 核验 ----
const last4 = ref('')
const verifying = ref(false)
const verifyError = ref('')
let session = ''

async function init() {
  try {
    info.value = await publicConfirmApi.info(props.token)
    step.value = 'verify'
  } catch (e) {
    fatal.value = publicErrorText(e)
    step.value = 'invalid'
  }
}
onMounted(init)

async function verify() {
  verifyError.value = ''
  if (!/^\d{4}$/.test(last4.value)) return void (verifyError.value = '请输入 4 位数字')
  verifying.value = true
  try {
    session = (await publicConfirmApi.verify(props.token, last4.value)).session
    await loadDays()
    step.value = 'report'
  } catch (e) {
    verifyError.value = publicErrorText(e)
    if ((e as { response?: { status?: number } }).response?.status === 410) {
      fatal.value = verifyError.value
      step.value = 'invalid'
    }
  } finally {
    verifying.value = false
  }
}

// ---- 报告 ----
const report = ref<ReportPayload | null>(null)
const loadedAt = ref(0)
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => (tick = setInterval(() => (now.value = Date.now()), 500)))
onBeforeUnmount(() => tick && clearInterval(tick))

interface Draft {
  selected: boolean
  overall: number
  nurses: Record<string, number>
  comment: string
}
const drafts = ref<Record<string, Draft>>({})

async function loadDays() {
  const r = await publicConfirmApi.days(props.token, session)
  report.value = r
  loadedAt.value = Date.now()
  const d: Record<string, Draft> = {}
  for (const day of r.days) d[day.date] = { selected: day.status !== 'CONFIRMED', overall: 0, nurses: {}, comment: '' }
  drafts.value = d
}

const pendingDays = computed(() => (report.value?.days ?? []).filter((d) => d.status !== 'CONFIRMED'))
const selectedDays = computed(() => (report.value?.days ?? []).filter((d) => d.status !== 'CONFIRMED' && drafts.value[d.date]?.selected))
const label = (date: string) => {
  const [, m, d] = date.split('-')
  return `${Number(m)}月${Number(d)}日 周${'日一二三四五六'[new Date(date + 'T00:00:00').getDay()]}`
}
const statusText = (d: ReportDay) => (d.status === 'CONFIRMED' ? '已确认 ✓' : d.status === 'STALE' ? '护理记录有更新，请重新确认' : '待确认')

// ---- 确认 ----
const acknowledged = ref(false)
const method = ref<'SIGNATURE' | 'BUTTON'>('SIGNATURE')
const pad = ref<InstanceType<typeof SignaturePad> | null>(null)
const submitting = ref(false)
const submitError = ref('')
const done = ref('')

/** 必须看够时间：和后端一致，基础 6 秒 + 每多选一天 2 秒（封顶 30 秒），后端会再校验一次 */
const needMs = computed(() => Math.min(30_000, 6_000 + 2_000 * Math.max(1, selectedDays.value.length)))
const waitSeconds = computed(() => Math.max(0, Math.ceil((loadedAt.value + needMs.value - now.value) / 1000)))
const missingRating = computed(() => selectedDays.value.find((d) => !drafts.value[d.date].overall))
const readyReason = computed(() => {
  if (selectedDays.value.length === 0) return '请勾选要确认的日期'
  if (missingRating.value) return `请给 ${label(missingRating.value.date)} 打分`
  if (!acknowledged.value) return '请勾选“我已阅读以上内容”'
  if (waitSeconds.value > 0) return `请先仔细阅读（还需 ${waitSeconds.value} 秒）`
  return ''
})

async function submit(holdMs?: number) {
  submitError.value = ''
  if (readyReason.value) return void (submitError.value = readyReason.value)
  let signatureData: string | undefined
  if (method.value === 'SIGNATURE') {
    const img = pad.value?.toPng()
    if (!img) return void (submitError.value = '请在框里手写签上您的名字')
    signatureData = img
  }
  submitting.value = true
  try {
    const res = await publicConfirmApi.confirm(props.token, session, {
      viewToken: report.value!.viewToken,
      items: selectedDays.value.map((d) => {
        const dr = drafts.value[d.date]
        return {
          date: d.date,
          satisfaction: dr.overall,
          comment: dr.comment.trim() || undefined,
          nurseRatings: d.nurses.filter((n) => dr.nurses[n.signatureId]).map((n) => ({ signatureId: n.signatureId, score: dr.nurses[n.signatureId] })),
        }
      }),
      method: method.value,
      signatureData,
      holdMs,
      deviceId: getDeviceId(),
      acknowledged: true,
    })
    done.value = `已确认 ${res.confirmed.length} 天，感谢您的反馈！`
    acknowledged.value = false
    pad.value?.clear()
    await loadDays()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e) {
    const msg = publicErrorText(e)
    submitError.value = msg
    if (/刷新|重新查看|更新/.test(msg)) await loadDays().catch(() => undefined)
  } finally {
    submitting.value = false
  }
}

// ---- 长按确认键 ----
const holdMin = computed(() => report.value?.holdMinMs ?? 1500)
const holdPct = ref(0)
let holdStart = 0
let holdRaf = 0
function holdLoop() {
  holdPct.value = Math.min(100, ((performance.now() - holdStart) / holdMin.value) * 100)
  if (holdPct.value >= 100) {
    const ms = Math.round(performance.now() - holdStart)
    holdEnd(false)
    void submit(ms)
    return
  }
  holdRaf = requestAnimationFrame(holdLoop)
}
function holdBegin(e: Event) {
  e.preventDefault()
  if (submitting.value) return
  if (readyReason.value) return void (submitError.value = readyReason.value)
  submitError.value = ''
  holdStart = performance.now()
  holdRaf = requestAnimationFrame(holdLoop)
}
function holdEnd(cancel = true) {
  cancelAnimationFrame(holdRaf)
  if (cancel) holdPct.value = 0
  else setTimeout(() => (holdPct.value = 0), 300)
}
</script>

<template>
  <div class="cc-page">
    <div class="cc-head">
      <div class="cc-brand">伴月轩月子中心</div>
      <div class="cc-title">每日服务报告</div>
    </div>

    <div v-if="step === 'loading'" class="cc-center"><n-spin /></div>

    <div v-else-if="step === 'invalid'" class="cc-card cc-center">
      <div class="cc-big">⚠</div>
      <div>{{ fatal }}</div>
    </div>

    <!-- 核验本人 -->
    <div v-else-if="step === 'verify'" class="cc-card">
      <div class="cc-hi">{{ info?.storeName }}</div>
      <p>您好，<b>{{ info?.customerName }}</b>（姓名已隐藏部分字）。为保护您的隐私，请输入您在月子中心<b>登记的手机号后四位</b>，核验是您本人。</p>
      <n-input v-model:value="last4" size="large" maxlength="4" inputmode="numeric" placeholder="手机号后四位" :disabled="info?.locked" style="text-align: center" @keyup.enter="verify" />
      <div v-if="info?.locked" class="cc-err">验证次数过多，暂时锁定，请稍后再试或联系护理师。</div>
      <div v-if="verifyError" class="cc-err">{{ verifyError }}</div>
      <n-button type="primary" size="large" block :loading="verifying" :disabled="info?.locked" style="margin-top: 12px" @click="verify">确认，查看服务报告</n-button>
    </div>

    <!-- 报告 -->
    <template v-else-if="report">
      <div class="cc-card cc-intro">
        <b>{{ report.storeName }}</b> · {{ report.customerName }}<span v-if="report.roomNo"> · {{ report.roomNo }} 房</span>
        <div class="cc-sub">以下是最近 {{ report.windowDays }} 天的护理服务报告。请查看后逐天确认，并对护理师的服务打分——您的确认和评价会如实留存。</div>
        <div v-if="done" class="cc-ok">{{ done }}</div>
      </div>

      <div v-if="report.days.length === 0" class="cc-card cc-center">最近 {{ report.windowDays }} 天还没有护理记录。</div>

      <div v-for="d in report.days" :key="d.date" class="cc-card" :class="{ 'cc-done': d.status === 'CONFIRMED' }">
        <div class="cc-day-head">
          <n-checkbox v-if="d.status !== 'CONFIRMED'" v-model:checked="drafts[d.date].selected" />
          <div class="cc-date"><b>{{ label(d.date) }}</b><span v-if="d.stayDay"> · 入住第 {{ d.stayDay }} 天</span></div>
          <span class="cc-status" :class="`cc-st-${d.status}`">{{ statusText(d) }}</span>
        </div>

        <div v-if="d.nurses.length" class="cc-row"><span class="cc-k">值班护理师</span>{{ d.nurses.map((n) => `${n.name}（${SIGN_SHIFT_LABEL[n.shift]}）`).join('、') }}</div>
        <div v-if="d.services.length" class="cc-row">
          <span class="cc-k">今日完成的服务</span>
          <span v-for="(s, i) in d.services" :key="i" class="cc-chip">{{ s.name }}<template v-if="s.baby"> · {{ s.baby }}</template><template v-if="s.time"> {{ s.time }}</template></span>
        </div>

        <details class="cc-det" :open="d.status !== 'CONFIRMED'">
          <summary>产妇护理记录</summary>
          <div v-for="g in d.summary.mother" :key="g.title" class="cc-grp">
            <div class="cc-gt">{{ g.title }}</div>
            <div v-for="it in g.items" :key="it.label" class="cc-item"><span>{{ it.label }}</span><b>{{ it.value }}</b></div>
          </div>
          <div v-if="d.summary.mother.length === 0" class="cc-empty">当天没有记录内容</div>
        </details>
        <details v-for="b in d.summary.babies" :key="b.title" class="cc-det" :open="d.status !== 'CONFIRMED'">
          <summary>{{ b.title }} 护理记录</summary>
          <div v-for="g in b.groups" :key="g.title" class="cc-grp">
            <div class="cc-gt">{{ g.title }}</div>
            <div v-for="it in g.items" :key="it.label" class="cc-item"><span>{{ it.label }}</span><b>{{ it.value }}</b></div>
          </div>
          <div v-if="b.feeding" class="cc-grp">
            <div class="cc-gt">喂养与排泄</div>
            <div v-for="(v, k) in b.feeding" :key="k" class="cc-item"><span>{{ k }}</span><b>{{ v }}</b></div>
          </div>
          <div v-if="b.groups.length === 0 && !b.feeding" class="cc-empty">当天没有记录内容</div>
        </details>

        <!-- 打分：只有待确认的日子才需要 -->
        <div v-if="d.status !== 'CONFIRMED' && drafts[d.date]?.selected" class="cc-rate">
          <div class="cc-rate-row"><span>今天整体满意度 <i class="cc-req">*</i></span><n-rate v-model:value="drafts[d.date].overall" size="large" /></div>
          <div v-for="n in d.nurses" :key="n.signatureId" class="cc-rate-row">
            <span>{{ n.name }}（{{ SIGN_SHIFT_LABEL[n.shift] }}）的服务</span><n-rate v-model:value="drafts[d.date].nurses[n.signatureId]" />
          </div>
          <n-input v-model:value="drafts[d.date].comment" type="textarea" placeholder="想对护理师说的话、意见或建议（可不填）" maxlength="500" :autosize="{ minRows: 2, maxRows: 4 }" />
        </div>
        <div v-else-if="d.status === 'CONFIRMED'" class="cc-rate-row">
          <span>您的评价</span><n-rate readonly :value="d.satisfaction ?? 0" />
        </div>
      </div>

      <!-- 确认区 -->
      <div v-if="pendingDays.length" class="cc-card cc-confirm">
        <label class="cc-ack"><n-checkbox v-model:checked="acknowledged" /> 我已阅读以上护理记录小结，所选日期的服务内容属实</label>
        <div class="cc-method">
          <button type="button" :class="{ on: method === 'SIGNATURE' }" @click="method = 'SIGNATURE'">✍ 手写签名确认</button>
          <button type="button" :class="{ on: method === 'BUTTON' }" @click="method = 'BUTTON'">👆 长按按钮确认</button>
        </div>

        <template v-if="method === 'SIGNATURE'">
          <SignaturePad ref="pad" :height="150" placeholder="请在这里手写签上您的名字" />
          <div class="cc-pad-tools"><n-button size="small" quaternary @click="pad?.clear()">清除重写</n-button></div>
          <n-button type="primary" size="large" block :loading="submitting" :disabled="!!readyReason" @click="submit()">签名并确认 {{ selectedDays.length }} 天</n-button>
        </template>
        <template v-else>
          <div
            class="cc-hold"
            :class="{ disabled: !!readyReason || submitting }"
            @pointerdown="holdBegin"
            @pointerup="holdEnd()"
            @pointerleave="holdEnd()"
            @pointercancel="holdEnd()"
            @contextmenu.prevent
          >
            <div class="cc-hold-fill" :style="{ width: holdPct + '%' }" />
            <span class="cc-hold-text">{{ submitting ? '提交中…' : readyReason ? readyReason : `按住不放 ${(holdMin / 1000).toFixed(1)} 秒，确认 ${selectedDays.length} 天` }}</span>
          </div>
        </template>
        <div v-if="readyReason && method === 'SIGNATURE'" class="cc-tip">{{ readyReason }}</div>
        <div v-if="submitError" class="cc-err">{{ submitError }}</div>
        <div class="cc-tip">确认时系统会记录时间、设备等信息，作为您已确认服务内容的凭证。</div>
      </div>
    </template>

    <BeianFooter />
  </div>
</template>

<style scoped>
.cc-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 0 12px 24px;
  background: #eef2f5;
  min-height: 100vh;
  box-sizing: border-box;
}
.cc-head {
  padding: 18px 4px 10px;
  text-align: center;
}
.cc-brand {
  color: #7d8b63;
  font-size: 13px;
  letter-spacing: 2px;
}
.cc-title {
  font-size: 22px;
  font-weight: 700;
  color: #3d5a78;
}
.cc-card {
  margin-bottom: 12px;
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.cc-center {
  text-align: center;
  padding: 30px 14px;
  color: #6f6a62;
}
.cc-big {
  font-size: 36px;
  margin-bottom: 8px;
}
.cc-hi {
  font-weight: 700;
  margin-bottom: 6px;
}
.cc-err {
  margin-top: 8px;
  color: #b4533a;
  font-size: 13px;
}
.cc-intro .cc-sub {
  margin-top: 4px;
  color: #6f6a62;
  font-size: 13px;
}
.cc-ok {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #edf1e9;
  color: #5f6b49;
}
.cc-done {
  opacity: 0.85;
}
.cc-day-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cc-date {
  flex: 1;
}
.cc-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f4ecdf;
  color: #9a4f33;
}
.cc-st-CONFIRMED {
  background: #edf1e9;
  color: #5f6b49;
}
.cc-st-STALE {
  background: #f6e9e6;
  color: #b4533a;
}
.cc-row {
  margin-top: 8px;
  font-size: 13px;
  color: #3b3a37;
}
.cc-k {
  display: inline-block;
  margin-right: 8px;
  color: #86817a;
}
.cc-chip {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 1px 8px;
  border-radius: 10px;
  background: #eef2f5;
  color: #5b83aa;
  font-size: 12px;
}
.cc-det {
  margin-top: 10px;
  border-top: 1px dashed #e6e3d9;
  padding-top: 8px;
}
.cc-det summary {
  cursor: pointer;
  font-weight: 600;
  color: #3d5a78;
}
.cc-grp {
  margin-top: 8px;
}
.cc-gt {
  font-size: 12px;
  color: #c96f4f;
  margin-bottom: 2px;
}
.cc-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
  font-size: 13px;
}
.cc-item span {
  color: #6f6a62;
  flex-shrink: 0;
}
.cc-item b {
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}
.cc-empty {
  margin-top: 6px;
  color: #a8a39a;
  font-size: 13px;
}
.cc-rate {
  margin-top: 12px;
  padding: 10px;
  border-radius: 10px;
  background: #fbfaf6;
  border: 1px solid #dde7f0;
}
.cc-rate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.cc-req {
  color: #b4533a;
  font-style: normal;
}
.cc-confirm {
  border: 1px solid #d3dccb;
}
.cc-ack {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 10px;
}
.cc-method {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.cc-method button {
  flex: 1;
  padding: 8px 4px;
  border: 1px solid #dde7f0;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
}
.cc-method button.on {
  border-color: #7d8b63;
  background: #edf1e9;
  color: #5f6b49;
  font-weight: 600;
}
.cc-pad-tools {
  text-align: right;
  margin: 4px 0 8px;
}
.cc-hold {
  position: relative;
  height: 52px;
  border-radius: 10px;
  background: #d3dccb;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  cursor: pointer;
}
.cc-hold.disabled {
  background: #e6e3d9;
  cursor: not-allowed;
}
.cc-hold-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: #7d8b63;
}
.cc-hold-text {
  position: relative;
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  font-weight: 600;
  color: #5f6b49;
  text-align: center;
  font-size: 14px;
}
.cc-tip {
  margin-top: 8px;
  color: #86817a;
  font-size: 12px;
}
</style>
