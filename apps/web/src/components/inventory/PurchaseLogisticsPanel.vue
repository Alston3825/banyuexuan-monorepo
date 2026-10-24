<script setup lang="ts">
/**
 * 采购单的“采购平台 / 平台订单号 / 快递物流”：采购员登记快递公司和单号，系统用快递100自动查物流轨迹
 * （打开时查一次，另外服务器每 30 分钟自动刷新没签收的），签收后会显示“已签收”提醒仓库收货。
 * 以后 1688 开放平台接通后，这里的单号会由平台订单自动带出。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NSelect, NSpace, NTag, NTimeline, NTimelineItem } from 'naive-ui'
import { purchaseOrderApi, type LogisticsMeta, type PurchaseLogistics } from '../../api/modules/inventory.api'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ orderId: string; canEdit: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const PLATFORM_LABEL: Record<string, string> = { '1688': '1688', TAOBAO: '淘宝/天猫', PDD: '拼多多', OTHER: '其他' }
const meta = ref<LogisticsMeta | null>(null)
const info = ref<PurchaseLogistics | null>(null)
const form = ref({ platform: null as string | null, platformOrderNo: '', expressCompany: null as string | null, expressNo: '', expressPhoneTail: '' })
const saving = ref(false)
const refreshing = ref(false)

const platformOptions = computed(() => (meta.value?.platforms ?? []).map((p) => ({ label: PLATFORM_LABEL[p] ?? p, value: p })))
const companyOptions = computed(() => (meta.value?.companies ?? []).map((c) => ({ label: c.name, value: c.code })))
const stateType = computed(() => (info.value?.logisticsState === 3 ? 'success' : info.value?.logisticsState === 2 || info.value?.logisticsState === 4 || info.value?.logisticsState === 14 ? 'error' : 'info'))
const dirty = computed(() => {
  const i = info.value
  if (!i) return false
  return (
    (form.value.platform ?? null) !== (i.platform ?? null) ||
    form.value.platformOrderNo !== (i.platformOrderNo ?? '') ||
    (form.value.expressCompany ?? null) !== (i.expressCompany ?? null) ||
    form.value.expressNo !== (i.expressNo ?? '') ||
    form.value.expressPhoneTail !== (i.expressPhoneTail ?? '')
  )
})

function fill(i: PurchaseLogistics) {
  info.value = i
  form.value = { platform: i.platform, platformOrderNo: i.platformOrderNo ?? '', expressCompany: i.expressCompany, expressNo: i.expressNo ?? '', expressPhoneTail: i.expressPhoneTail ?? '' }
}
async function load() {
  if (!meta.value) meta.value = await purchaseOrderApi.logisticsMeta()
  fill(await purchaseOrderApi.logistics(props.orderId))
  // 打开时顺手查一次最新物流（有单号、没签收、快递100已配置、超过 10 分钟没查过）
  const i = info.value!
  const stale = !i.checkedAt || Date.now() - new Date(i.checkedAt).getTime() > 10 * 60_000
  if (meta.value.configured && i.expressNo && i.expressCompany && i.logisticsState !== 3 && stale) void refresh(true)
}
watch(() => props.orderId, load)
onMounted(load)

async function save() {
  saving.value = true
  try {
    fill(
      await purchaseOrderApi.saveLogistics(props.orderId, {
        platform: form.value.platform ?? '',
        platformOrderNo: form.value.platformOrderNo,
        expressCompany: form.value.expressCompany ?? '',
        expressNo: form.value.expressNo,
        expressPhoneTail: form.value.expressPhoneTail,
      }),
    )
    message.success('已保存')
    emit('changed')
  } finally {
    saving.value = false
  }
}
/** 填完单号直接点“查询物流”：有没保存的修改就先保存（保存时会顺手查一次），否则直接刷新 */
async function queryNow() {
  if (!form.value.expressCompany || !form.value.expressNo.trim()) return void message.warning('请先选择快递公司并填写快递单号')
  if (dirty.value) {
    if (!props.canEdit) return void message.warning('没有权限修改物流信息')
    await save()
    return
  }
  await refresh(false)
}
async function refresh(silent = false) {
  if (!info.value?.expressNo || !info.value.expressCompany) return void message.warning('请先填写并保存快递公司和快递单号')
  refreshing.value = true
  try {
    fill(await purchaseOrderApi.refreshLogistics(props.orderId))
    if (!silent) message.success('物流已更新')
    emit('changed')
  } catch (e) {
    if (!silent) throw e
    info.value = await purchaseOrderApi.logistics(props.orderId)
  } finally {
    refreshing.value = false
  }
}
const fmtTime = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '')
</script>

<template>
  <div class="pl">
    <div class="pl-title">
      采购平台与物流
      <n-tag v-if="info?.logisticsStateLabel" size="small" :type="stateType" round>{{ info.logisticsStateLabel }}</n-tag>
    </div>

    <n-alert v-if="meta && !meta.configured" type="warning" :bordered="false" style="margin-bottom: 8px">快递100 还没有配置密钥，暂时不能自动查物流；单号可以先登记，配置好后再刷新。</n-alert>

    <div class="pl-grid">
      <label><span>采购平台</span><n-select v-model:value="form.platform" :options="platformOptions" :disabled="!canEdit" clearable placeholder="选择" /></label>
      <label><span>平台订单号</span><n-input v-model:value="form.platformOrderNo" :disabled="!canEdit" placeholder="如 1688 订单号" /></label>
      <label><span>快递公司</span><n-select v-model:value="form.expressCompany" :options="companyOptions" :disabled="!canEdit" filterable clearable placeholder="选择快递公司" /></label>
      <label><span>快递单号</span><n-input v-model:value="form.expressNo" :disabled="!canEdit" placeholder="快递单号" /></label>
      <label v-if="form.expressCompany === 'shunfeng'"><span>手机尾号（顺丰必填）</span><n-input v-model:value="form.expressPhoneTail" :disabled="!canEdit" maxlength="4" placeholder="收/寄件手机后 4 位" /></label>
    </div>
    <n-space style="margin-top: 8px" :wrap="true" align="center">
      <n-button v-if="canEdit" :loading="saving" :disabled="!dirty" @click="save">只保存</n-button>
      <n-button :loading="refreshing || saving" :disabled="!form.expressCompany || !form.expressNo.trim()" @click="queryNow">查询物流</n-button>
      <span v-if="info?.checkedAt" class="pl-sub">最近查询：{{ fmtTime(info.checkedAt) }}</span>
    </n-space>

    <n-alert v-if="info?.error" type="error" :bordered="false" style="margin-top: 8px">上次查询失败：{{ info.error }}</n-alert>

    <n-timeline v-if="info && info.trace.length > 0" style="margin-top: 12px">
      <n-timeline-item v-for="(t, i) in info.trace" :key="i" :type="i === 0 ? 'success' : 'default'" :title="t.context" :content="t.location" :time="t.time" />
    </n-timeline>
    <div v-else-if="info?.expressNo" class="pl-sub" style="margin-top: 8px">暂时还没有物流轨迹（刚发出的快递可能要几小时后才有；如果一直没有，请核对快递公司和单号是否填对）。</div>
  </div>
</template>

<style scoped>
.pl {
  margin: 12px 0;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
}
.pl-title {
  margin-bottom: 8px;
  font-weight: 700;
  color: #2a64b0;
}
.pl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 12px;
}
.pl-grid label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #666;
}
.pl-sub {
  color: #999;
  font-size: 12px;
}
</style>
