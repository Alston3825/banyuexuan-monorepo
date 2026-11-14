<script setup lang="ts">
/**
 * 物品的采购价格记录：每次入库的日期、入库单号、采购单号、供应商、数量和当次实际单价。
 * 同一物品不同时间采购价不同，各批次按当次单价入账；库存里显示的是它们的加权平均价。
 */
import { ref, watch } from 'vue'
import { NCard, NEmpty, NModal, NSpin } from 'naive-ui'
import { inventoryItemApi } from '../../api/modules/inventory.api'
import type { ItemPriceHistory } from '../../api/types/inventory'

const props = defineProps<{ show: boolean; itemId: string | null }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

const data = ref<ItemPriceHistory | null>(null)
const loading = ref(false)
const yuan = (fen: number) => (fen / 100).toFixed(2)
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN')

watch(
  () => [props.show, props.itemId] as const,
  async ([show, id]) => {
    if (!show || !id) return
    loading.value = true
    data.value = null
    try {
      data.value = await inventoryItemApi.priceHistory(id)
    } finally {
      loading.value = false
    }
  },
)
</script>

<template>
  <n-modal :mask-closable="false" :show="show" @update:show="(v: boolean) => emit('update:show', v)">
    <n-card :title="`采购价格记录${data ? '：' + data.item.name : ''}`" style="width: min(760px, 96vw); max-height: 92vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true" closable @close="emit('update:show', false)">
      <n-spin :show="loading">
        <template v-if="data">
          <div class="ph-sum">
            <span>共入库 {{ data.rows.length }} 次</span>
            <span>平均单价 <b>{{ yuan(data.avgCost) }}</b> 元</span>
            <span>最低 {{ yuan(data.minCost) }} · 最高 {{ yuan(data.maxCost) }} 元</span>
          </div>
          <n-empty v-if="data.rows.length === 0" description="还没有入库记录" />
          <div v-for="(r, i) in data.rows" :key="i" class="ph-row">
            <div class="ph-price">{{ yuan(r.unitCost) }}<small> 元/{{ data.item.unit }}</small></div>
            <div class="ph-info">
              <div><b>{{ day(r.date) }}</b> · 入库 {{ r.quantity }} {{ data.item.unit }} · 小计 {{ yuan(r.unitCost * r.quantity) }} 元</div>
              <div class="ph-sub">入库单 {{ r.receiptNo }}<span v-if="r.orderNo"> · 采购单 {{ r.orderNo }}</span><span v-if="r.supplierName"> · {{ r.supplierName }}</span> · {{ r.warehouseName }}</div>
            </div>
          </div>
        </template>
      </n-spin>
    </n-card>
  </n-modal>
</template>

<style scoped>
.ph-sum {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-bottom: 10px;
  color: var(--c-555555);
}
.ph-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}
.ph-price {
  min-width: 96px;
  font-size: 18px;
  font-weight: 700;
  color: var(--c-d9822b);
}
.ph-price small {
  font-size: 12px;
  font-weight: 400;
  color: var(--c-888888);
}
.ph-sub {
  font-size: 12px;
  color: var(--c-888888);
}
</style>
