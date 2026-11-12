<script setup lang="ts">
/**
 * 申购单 / 采购单手动新建时的“物品明细”编辑器：
 * ① 顶上一个搜索框，输入名称/规格/品牌/编码就能搜到物品库里已录入的物品，点一下加入清单（已在清单里的数量 +1）；
 * ② “＋ 添加未录入的新物品”：之前没采购过的东西，直接填名称、规格、单位，保存时（按选项）同时加入物品库。
 * 每一行填数量、单价（元，选填）、用途（选填）。
 */
import { computed, ref } from 'vue'
import { NButton, NInput, NInputNumber, NSelect, NTag } from 'naive-ui'
import { inventoryItemApi } from '../../api/modules/inventory.api'
import { message } from '../../utils/discrete-api'

export interface ItemLine {
  key: number
  /** 物品库里已有的物品 id；新物品为 null */
  itemId: string | null
  name: string
  spec: string
  brand: string
  unit: string
  quantity: number | null
  /** 单价，单位：元 */
  unitPrice: number | null
  purpose: string
}

const props = withDefaults(defineProps<{ modelValue: ItemLine[]; showPurpose?: boolean; priceRequired?: boolean }>(), { showPurpose: true, priceRequired: false })
const emit = defineEmits<{ 'update:modelValue': [value: ItemLine[]] }>()

let seq = Date.now()
const newKey = () => seq++
const lines = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

interface Found { id: string; code: string; name: string; spec: string | null; brand: string | null; unit: string; referencePrice: string | number | null }
const found = ref<Found[]>([])
const searching = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
const options = computed(() =>
  found.value.map((i) => ({
    value: i.id,
    label: `${i.name}${i.spec ? ' ' + i.spec : ''}${i.brand ? ' · ' + i.brand : ''}（${i.unit}）${i.referencePrice ? ' · 参考价 ' + Number(i.referencePrice) + ' 元' : ''}`,
  })),
)
function onSearch(q: string) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    searching.value = true
    try {
      found.value = await inventoryItemApi.search(q)
    } finally {
      searching.value = false
    }
  }, 250)
}
// 点开下拉就先给一批（不输入也能翻）
const onFocus = () => found.value.length === 0 && onSearch('')

const picker = ref<string | null>(null)
function pick(id: string | null) {
  picker.value = null
  const it = found.value.find((x) => x.id === id)
  if (!it) return
  const exist = lines.value.find((l) => l.itemId === it.id)
  if (exist) {
    exist.quantity = (exist.quantity ?? 0) + 1
    message.info(`「${it.name}」已经在清单里，数量 +1`)
    return
  }
  lines.value = [
    ...lines.value,
    { key: newKey(), itemId: it.id, name: it.name, spec: it.spec ?? '', brand: it.brand ?? '', unit: it.unit, quantity: 1, unitPrice: it.referencePrice ? Number(it.referencePrice) : null, purpose: '' },
  ]
}
function addNew() {
  lines.value = [...lines.value, { key: newKey(), itemId: null, name: '', spec: '', brand: '', unit: '', quantity: 1, unitPrice: null, purpose: '' }]
}
function remove(i: number) {
  lines.value = lines.value.filter((_, idx) => idx !== i)
}
const total = computed(() => lines.value.reduce((s, l) => s + (l.unitPrice !== null && l.quantity ? l.unitPrice * l.quantity : 0), 0))
</script>

<template>
  <div class="il">
    <div class="il-tools">
      <n-select
        :value="picker"
        class="il-search"
        :options="options"
        :loading="searching"
        filterable
        remote
        clearable
        :clear-filter-after-select="true"
        placeholder="🔍 搜索已录入的物品（名称 / 规格 / 品牌 / 编码），点一下加入"
        :show-on-focus="true"
        @search="onSearch"
        @focus="onFocus"
        @update:value="pick"
      />
      <n-button dashed @click="addNew">＋ 添加未录入的新物品</n-button>
    </div>

    <div v-if="lines.length === 0" class="il-empty">还没有物品：在上面搜索物品库里已有的，或点“添加未录入的新物品”。</div>

    <div v-for="(l, i) in lines" :key="l.key" class="il-row">
      <div class="il-head">
        <b>{{ i + 1 }}.</b>
        <template v-if="l.itemId">
          <span class="il-name">{{ l.name }}</span>
          <span class="il-sub">{{ [l.spec, l.brand].filter(Boolean).join(' · ') }}</span>
          <n-tag size="small" type="success" :bordered="false">已录入</n-tag>
        </template>
        <template v-else>
          <n-tag size="small" type="warning" :bordered="false">新物品</n-tag>
        </template>
        <n-button class="il-del" size="tiny" type="error" quaternary @click="remove(i)">删除</n-button>
      </div>
      <div v-if="!l.itemId" class="il-grid">
        <n-input v-model:value="l.name" placeholder="物品名称（必填）" />
        <n-input v-model:value="l.spec" placeholder="规格/型号/尺寸" />
        <n-input v-model:value="l.brand" placeholder="品牌（选填）" />
        <n-input v-model:value="l.unit" placeholder="单位（必填，如 个/箱/桶）" />
      </div>
      <div class="il-grid">
        <n-input-number v-model:value="l.quantity" :min="1" :precision="0" placeholder="数量" style="width: 100%">
          <template #suffix>{{ l.unit }}</template>
        </n-input-number>
        <n-input-number v-model:value="l.unitPrice" :min="0" :show-button="false" :placeholder="priceRequired ? '单价（元，必填）' : '单价（元，选填）'" style="width: 100%">
          <template #suffix>元</template>
        </n-input-number>
        <n-input v-if="showPurpose" v-model:value="l.purpose" placeholder="用途（选填）" />
      </div>
    </div>

    <div v-if="lines.length > 0" class="il-sum">共 {{ lines.length }} 项<template v-if="total > 0"> · 已填单价的合计 <b>{{ total.toFixed(2) }}</b> 元</template></div>
  </div>
</template>

<style scoped>
.il-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.il-search {
  flex: 1 1 320px;
  min-width: 240px;
}
.il-empty {
  color: #86817a;
  font-size: 13px;
  padding: 10px 0;
}
.il-row {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid #e6e3d9;
  border-radius: 8px;
  background: #fbfaf6;
}
.il-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.il-name {
  font-weight: 600;
}
.il-sub {
  color: #86817a;
  font-size: 12px;
}
.il-del {
  margin-left: auto;
}
.il-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 6px;
}
.il-sum {
  margin-top: 6px;
  padding: 6px 10px;
  background: #eef2f5;
  border-radius: 6px;
  font-size: 13px;
}
</style>
