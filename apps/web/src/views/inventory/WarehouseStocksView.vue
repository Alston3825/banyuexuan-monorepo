<script setup lang="ts">
/**
 * 库存查询：打开就能看到——顶上是采购预警（低于安全库存/缺货的物品数）和库存汇总，下面是每种物品的当前库存数量
 * （预警的排在最前面，没入过库的显示 0）；搜索框可以直接查某个物品；也能按仓库、按状态筛选。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NAlert, NButton, NDataTable, NInput, NRadioButton, NRadioGroup, NSelect, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import { warehouseApi, warehouseStockApi } from '../../api/modules/inventory.api'
import ItemPriceHistoryDialog from '../../components/inventory/ItemPriceHistoryDialog.vue'
import type { StockOverview, StockOverviewFilter, StockOverviewRow } from '../../api/types/inventory'

const router = useRouter()
const data = ref<StockOverview | null>(null)
const warehouses = ref<{ id: string; name: string }[]>([])
const loading = ref(false)

const warehouseId = ref<string | null>(null)
const keyword = ref('')
const status = ref<StockOverviewFilter>('ALL')
const warehouseOptions = computed(() => warehouses.value.map((w) => ({ label: w.name, value: w.id })))
const summary = computed(() => data.value?.summary)
const yuan = (fen: number) => (fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const priceShow = ref(false)
const priceItemId = ref<string | null>(null)

let seq = 0
async function fetchList() {
  const my = ++seq
  loading.value = true
  try {
    const res = await warehouseStockApi.overview({ warehouseId: warehouseId.value ?? undefined, keyword: keyword.value.trim() || undefined, status: status.value })
    if (my === seq) data.value = res
  } finally {
    if (my === seq) loading.value = false
  }
}

const STATUS_TAG = {
  OUT: { text: '缺货', type: 'error' },
  LOW: { text: '低库存', type: 'warning' },
  OK: { text: '正常', type: 'success' },
  NO_THRESHOLD: { text: '未设预警线', type: 'default' },
} as const

const columns: DataTableColumns<StockOverviewRow> = [
  {
    key: 'name',
    title: '物品',
    minWidth: 220,
    render: (r) => h('div', null, [h('div', { style: 'font-weight:600' }, r.name), h('div', { style: 'color:#86817a;font-size:12px' }, [r.spec, r.brand, r.code].filter(Boolean).join(' · '))]),
  },
  {
    key: 'quantity',
    title: '当前库存',
    width: 120,
    render: (r) => h('span', { style: r.status === 'OUT' || r.status === 'LOW' ? 'color:#b4533a;font-weight:700' : r.quantity > 0 ? 'font-weight:600' : 'color:#86817a' }, `${r.quantity} ${r.unit}`),
  },
  { key: 'safetyStockThreshold', title: '安全库存线', width: 100, render: (r) => (r.safetyStockThreshold === null ? '-' : `${r.safetyStockThreshold} ${r.unit}`) },
  { key: 'status', title: '状态', width: 100, render: (r) => h(NTag, { size: 'small', type: STATUS_TAG[r.status].type, bordered: false }, { default: () => STATUS_TAG[r.status].text }) },
  {
    key: 'warehouses',
    title: '分仓库存',
    minWidth: 180,
    render: (r) => (r.warehouses.length === 0 ? h('span', { style: 'color:#a8a39a' }, '无库存') : r.warehouses.map((w) => `${w.warehouseName} ${w.quantity}`).join('；')),
  },
  { key: 'avgCost', title: '平均单价（元）', width: 110, render: (r) => (r.quantity > 0 ? yuan(r.avgCost) : '-') },
  { key: 'lastCost', title: '最近采购价（元）', width: 120, render: (r) => (r.lastCost === null ? '-' : yuan(r.lastCost)) },
  {
    key: 'prices',
    title: '价格记录',
    width: 90,
    fixed: 'right',
    render: (r) => h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => ((priceItemId.value = r.itemId), (priceShow.value = true)) }, { default: () => '查看' }),
  },
  { key: 'updatedAt', title: '最近变动', width: 150, render: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '-') },
]

let timer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(fetchList, 300)
})
watch([warehouseId, status], fetchList)
onBeforeUnmount(() => timer && clearTimeout(timer))
onMounted(async () => {
  warehouses.value = await warehouseApi.list().catch(() => [])
  await fetchList()
})
</script>

<template>
  <div>
    <n-alert v-if="summary && summary.alertCount > 0" type="warning" :show-icon="false" style="margin-bottom: 12px">
      <n-space align="center" justify="space-between" :wrap="true">
        <span>
          ⚠ <b>采购预警：{{ summary.alertCount }} 种物品库存不足</b>
          （缺货 <b style="color: #b4533a">{{ summary.outCount }}</b> 种，低于安全库存 <b style="color: #c96f4f">{{ summary.lowCount }}</b> 种），建议尽快申购补货。
        </span>
        <n-space :size="8">
          <n-button size="small" @click="status = 'ALERT'">只看预警物品</n-button>
          <n-button size="small" type="primary" @click="router.push('/inventory/purchase-requests')">去申购</n-button>
        </n-space>
      </n-space>
    </n-alert>
    <n-alert v-else-if="summary && summary.itemCount > 0" type="success" :show-icon="false" style="margin-bottom: 12px">✓ 目前没有低于安全库存的物品。（只有设置了“安全库存线”的物品才参与预警，可到“物品管理”里给常用物品设置。）</n-alert>

    <div v-if="summary" class="ws-cards">
      <div class="ws-card" @click="status = 'ALL'"><div class="ws-num">{{ summary.itemCount }}</div><div class="ws-lab">物品种类</div></div>
      <div class="ws-card" @click="status = 'IN_STOCK'"><div class="ws-num">{{ summary.inStockCount }}</div><div class="ws-lab">有库存的种类</div></div>
      <div class="ws-card ws-warn" @click="status = 'ALERT'"><div class="ws-num">{{ summary.alertCount }}</div><div class="ws-lab">库存预警</div></div>
      <div class="ws-card ws-bad" @click="status = 'OUT'"><div class="ws-num">{{ summary.outCount }}</div><div class="ws-lab">缺货</div></div>
      <div class="ws-card"><div class="ws-num">{{ yuan(summary.totalValue) }}</div><div class="ws-lab">库存总价值（元）</div></div>
    </div>

    <n-space style="margin-bottom: 12px" align="center" :wrap="true">
      <n-input v-model:value="keyword" clearable placeholder="🔍 搜索物品：名称 / 规格 / 品牌 / 编码" style="width: min(320px, 94vw)" />
      <n-select v-model:value="warehouseId" :options="warehouseOptions" clearable placeholder="全部仓库（合计）" style="width: min(200px, 94vw)" />
      <n-radio-group v-model:value="status">
        <n-radio-button value="ALL">全部</n-radio-button>
        <n-radio-button value="ALERT">预警</n-radio-button>
        <n-radio-button value="OUT">缺货</n-radio-button>
        <n-radio-button value="IN_STOCK">有库存</n-radio-button>
      </n-radio-group>
    </n-space>
    <item-price-history-dialog v-model:show="priceShow" :item-id="priceItemId" />
    <n-data-table :columns="columns" :data="data?.rows ?? []" :loading="loading" :row-key="(r: StockOverviewRow) => r.itemId" :scroll-x="1200" :pagination="{ pageSize: 30 }" />
  </div>
</template>

<style scoped>
.ws-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.ws-card {
  padding: 10px 14px;
  border: 1px solid #e6e3d9;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.ws-num {
  font-size: 22px;
  font-weight: 700;
}
.ws-lab {
  color: #86817a;
  font-size: 12px;
  margin-top: 2px;
}
.ws-warn .ws-num {
  color: #c96f4f;
}
.ws-bad .ws-num {
  color: #b4533a;
}
</style>
