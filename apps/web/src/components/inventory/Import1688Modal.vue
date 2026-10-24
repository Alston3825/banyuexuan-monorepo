<script setup lang="ts">
/**
 * 导入 1688 订单：在 1688“已买到的货品”里导出订单 Excel，拖进来，系统按金额/供应商/货品名智能对应到采购单，
 * 核对后一键登记平台订单号、快递公司和运单号（之后快递100 自动查物流）。
 */
import { computed, ref } from 'vue'
import { NButton, NCheckbox, NEmpty, NModal, NCard, NSelect, NSpace, NTag } from 'naive-ui'
import { purchaseOrderApi, type Import1688Row } from '../../api/modules/inventory.api'
import { message } from '../../utils/discrete-api'

const emit = defineEmits<{ done: [] }>()
const show = ref(false)
const parsing = ref(false)
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')

interface Line {
  row: Import1688Row
  checked: boolean
  poId: string | null
}
const lines = ref<Line[]>([])

const yuan = (n: number) => n.toFixed(2)
const cents = (n: number) => (n / 100).toFixed(2)
const CONF = { high: { type: 'success', text: '已对上' }, medium: { type: 'warning', text: '请核对' }, none: { type: 'error', text: '没对上' } } as const

function optionsOf(l: Line) {
  const seen = new Set<string>()
  const opts: { label: string; value: string }[] = []
  for (const p of [l.row.match, ...l.row.alternatives]) {
    if (!p || seen.has(p.id)) continue
    seen.add(p.id)
    opts.push({ label: `${p.orderNo} · ${p.supplierName} · ${cents(p.totalAmount)}元 · ${p.itemsText}`.slice(0, 80), value: p.id })
  }
  return opts
}
const briefOf = (l: Line) => [l.row.match, ...l.row.alternatives].find((p) => p?.id === l.poId) ?? null

function open() {
  lines.value = []
  fileName.value = ''
  show.value = true
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.xlsx$/i.test(file.name)) return void message.error('请上传 1688 导出的 Excel（.xlsx）文件')
  parsing.value = true
  try {
    const p = await purchaseOrderApi.import1688Preview(file)
    fileName.value = file.name
    lines.value = p.rows.map((row) => ({ row, checked: row.confidence === 'high' && !/关闭|取消/.test(row.order.status), poId: row.match?.id ?? null }))
  } catch (err) {
    message.error((err as Error).message || '读取失败')
  } finally {
    parsing.value = false
  }
}

const picked = computed(() => lines.value.filter((l) => l.checked && l.poId))
const dupPo = computed(() => {
  const c = new Map<string, number>()
  for (const l of picked.value) c.set(l.poId!, (c.get(l.poId!) ?? 0) + 1)
  return [...c.values()].some((n) => n > 1)
})

async function save() {
  saving.value = true
  try {
    const res = await purchaseOrderApi.import1688Commit(
      picked.value.map((l) => {
        const o = l.row.order
        return { purchaseOrderId: l.poId!, platformOrderNo: o.orderNo, expressNo: o.expressNos[0] ?? null, expressCompany: o.expressCompany, extraExpressNos: o.expressNos.slice(1) }
      }),
    )
    const bad = res.results.filter((r) => !r.ok)
    if (bad.length) message.warning(`登记了 ${res.okCount} 张，${bad.length} 张失败：${bad[0].error}`, { duration: 8000 })
    else message.success(`已登记 ${res.okCount} 张采购单的 1688 订单号和运单号，物流会自动查询`)
    if (res.okCount) emit('done')
    if (!bad.length) show.value = false
    else lines.value = lines.value.filter((l) => bad.some((b) => b.purchaseOrderId === l.poId))
  } catch (err) {
    message.error((err as Error).message || '登记失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-button @click="open">导入 1688 订单</n-button>
  <n-modal :show="show" :mask-closable="false" @update:show="(v: boolean) => (show = v)">
    <n-card title="导入 1688 订单，自动对应采购单" :bordered="false" style="width: min(980px, 96vw); max-height: 92vh; overflow: auto" closable @close="show = false">
      <input ref="fileInput" type="file" accept=".xlsx" style="display: none" @change="onFile" />
      <n-space align="center" :wrap="true">
        <n-button type="primary" :loading="parsing" @click="fileInput?.click()">{{ fileName ? '重新选择文件' : '选择 1688 导出的订单 Excel' }}</n-button>
        <span v-if="fileName" class="muted">{{ fileName }}</span>
      </n-space>
      <p class="muted">做法：1688 → 我的订单“已买到的货品” → 勾选订单 → 导出订单（.xlsx）。系统只读订单号、卖家、货品、金额、物流公司、运单号，不会保存收货人电话地址。</p>

      <n-empty v-if="!parsing && !lines.length" description="还没有选择文件" />
      <div v-else>
        <div class="muted" style="margin-bottom: 8px">
          共 {{ lines.length }} 张 1688 订单，已勾选 {{ picked.length }} 张。“已对上”默认勾选，“请核对”“没对上”需要你确认或在下拉里改选采购单。
        </div>
        <div v-for="l in lines" :key="l.row.order.orderNo" class="im-card" :class="{ off: !l.checked }">
          <div class="im-head">
            <n-checkbox v-model:checked="l.checked" :disabled="!l.poId" />
            <n-tag size="small" :type="CONF[l.row.confidence].type">{{ CONF[l.row.confidence].text }}</n-tag>
            <n-tag v-if="l.row.alreadyLinked" size="small">之前登记过</n-tag>
            <b class="im-seller">{{ l.row.order.seller || l.row.order.sellerMember }}</b>
            <span class="muted">{{ l.row.order.status }}</span>
          </div>
          <div class="im-body">
            <div class="im-col">
              <div class="muted">1688 订单 {{ l.row.order.orderNo }}</div>
              <div class="im-title">{{ l.row.order.titles.join(' ｜ ') }}</div>
              <div>货品 {{ yuan(l.row.order.goodsTotal) }} + 运费 {{ yuan(l.row.order.freight) }}，实付 <b>{{ yuan(l.row.order.paid) }}</b> 元</div>
              <div>
                <template v-if="l.row.order.expressNos.length">{{ l.row.order.expressCompanyRaw }} {{ l.row.order.expressNos.join('、') }}</template>
                <span v-else class="muted">暂无运单号</span>
              </div>
            </div>
            <div class="im-col">
              <n-select v-model:value="l.poId" :options="optionsOf(l)" clearable filterable placeholder="选择对应的采购单（不登记就留空）" @update:value="(v: string | null) => (l.checked = !!v)" />
              <div v-if="briefOf(l)" class="muted" style="margin-top: 4px">
                {{ briefOf(l)!.orderNo }}：{{ briefOf(l)!.supplierName }}，{{ cents(briefOf(l)!.totalAmount) }} 元，{{ briefOf(l)!.itemsText }}
              </div>
              <div v-if="l.row.reasons.length" class="ok">依据：{{ l.row.reasons.join('、') }}</div>
            </div>
          </div>
          <div v-for="n in l.row.notes" :key="n" class="warn">· {{ n }}</div>
        </div>
        <div v-if="dupPo" class="warn" style="margin: 8px 0">有两张 1688 订单选了同一张采购单，请只保留一张勾选。</div>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="show = false">取消</n-button>
          <n-button type="primary" :loading="saving" :disabled="!picked.length || dupPo" @click="save">登记勾选的 {{ picked.length }} 张</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.muted { color: #888; font-size: 13px; }
.ok { color: #18a058; font-size: 13px; margin-top: 4px; }
.warn { color: #d08a00; font-size: 13px; }
.im-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.im-card.off { opacity: 0.7; }
.im-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.im-seller { flex: 1 1 auto; min-width: 0; }
.im-body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.im-col { min-width: 0; font-size: 14px; }
.im-title { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin: 2px 0; }
@media (max-width: 767px) { .im-body { grid-template-columns: 1fr; } }
</style>
