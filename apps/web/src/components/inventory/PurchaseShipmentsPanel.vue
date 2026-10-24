<script setup lang="ts">
/** 采购单下的 1688 订单明细：每笔订单/每个运单号一行，显示物流状态，点开看轨迹；打开时自动刷新没签收的。 */
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NSpace, NTag, NTimeline, NTimelineItem } from 'naive-ui'
import { purchaseOrderApi, type PurchaseShipment } from '../../api/modules/inventory.api'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ orderId: string }>()
const emit = defineEmits<{ changed: [] }>()
const list = ref<PurchaseShipment[]>([])
const open = ref<string | null>(null)
const refreshing = ref(false)
const yuan = (cents: number) => (cents / 100).toFixed(2)
const tagType = (st: number | null) => (st === 3 ? 'success' : st === 2 || st === 4 || st === 14 ? 'error' : st === null || st === -1 ? 'default' : 'info')
const fmt = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '')

const signed = computed(() => list.value.filter((x) => x.logisticsState === 3).length)
const shipped = computed(() => list.value.filter((x) => x.expressNo).length)

async function load() {
  list.value = await purchaseOrderApi.shipments(props.orderId)
}
async function refreshAll(silent = false) {
  refreshing.value = true
  try {
    const r = await purchaseOrderApi.refreshShipments(props.orderId)
    if (!r.queued) return void (silent || message.info('没有需要刷新的运单（都已签收或还没有运单号）'))
    if (!silent) message.success(`正在后台查询 ${r.queued} 个运单，约 ${Math.ceil(r.queued * 1.2)} 秒后点“重新载入”查看`)
    setTimeout(() => void load().then(() => emit('changed')), Math.min(30_000, r.queued * 1500 + 2000))
  } finally {
    refreshing.value = false
  }
}
async function refreshOne(s: PurchaseShipment) {
  const upd = await purchaseOrderApi.refreshShipment(props.orderId, s.id)
  list.value = list.value.map((x) => (x.id === s.id ? upd : x))
  message.success('已更新')
  emit('changed')
}
watch(() => props.orderId, load)
onMounted(async () => {
  await load()
  const stale = list.value.some((x) => x.expressNo && x.expressCompany && x.logisticsState !== 3 && (!x.checkedAt || Date.now() - new Date(x.checkedAt).getTime() > 10 * 60_000))
  if (stale) void refreshAll(true)
})
</script>

<template>
  <div v-if="list.length" class="ps">
    <div class="ps-title">
      1688 订单与物流（{{ list.length }} 笔，已发货 {{ shipped }}，已签收 {{ signed }}）
      <n-space style="display: inline-flex; margin-left: 8px" :size="6">
        <n-button size="tiny" :loading="refreshing" @click="refreshAll(false)">刷新物流</n-button>
        <n-button size="tiny" @click="load">重新载入</n-button>
      </n-space>
    </div>
    <div v-for="s in list" :key="s.id" class="ps-row">
      <div class="ps-head" @click="open = open === s.id ? null : s.id">
        <n-tag size="small" :type="tagType(s.logisticsState)" round>{{ s.expressNo ? (s.logisticsStateLabel ?? '待查询') : '未发货' }}</n-tag>
        <b class="ps-seller">{{ s.sellerName || '（卖家未知）' }}</b>
        <span class="ps-amt">{{ yuan(s.amount) }} 元</span>
      </div>
      <div class="ps-title2">{{ s.goodsTitle }}</div>
      <div class="ps-sub">
        订单 {{ s.platformOrderNo }}
        <template v-if="s.expressNo"> ｜ {{ s.expressCompanyName }} {{ s.expressNo }}</template>
        <template v-if="s.checkedAt"> ｜ 查询于 {{ fmt(s.checkedAt) }}</template>
      </div>
      <div v-if="s.error" class="ps-err">上次查询失败：{{ s.error }}</div>
      <template v-if="open === s.id">
        <n-timeline v-if="s.trace.length" style="margin-top: 8px">
          <n-timeline-item v-for="(t, i) in s.trace" :key="i" :type="i === 0 ? 'success' : 'default'" :title="t.context" :content="t.location" :time="t.time" />
        </n-timeline>
        <div v-else class="ps-sub" style="margin-top: 6px">暂时没有物流轨迹（刚发出的快递可能要几小时后才有）。</div>
        <n-button v-if="s.expressNo" size="tiny" style="margin-top: 6px" @click="refreshOne(s)">只刷新这个运单</n-button>
      </template>
      <div v-else-if="s.trace.length" class="ps-sub">最新：{{ s.trace[0].time }} {{ s.trace[0].context }}（点上面展开全部）</div>
    </div>
  </div>
</template>

<style scoped>
.ps { margin: 12px 0; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 10px; }
.ps-title { margin-bottom: 8px; font-weight: 700; color: #2a64b0; }
.ps-row { padding: 8px 0; border-top: 1px solid #f0f0f0; }
.ps-head { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.ps-seller { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-amt { color: #555; }
.ps-title2 { margin: 2px 0; font-size: 13px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ps-sub { color: #999; font-size: 12px; word-break: break-all; }
.ps-err { color: #d03050; font-size: 12px; }
</style>
