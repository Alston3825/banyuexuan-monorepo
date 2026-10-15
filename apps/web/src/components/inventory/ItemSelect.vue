<script setup lang="ts">
/**
 * 选物品的下拉：输入名称 / 规格 / 品牌 / 编码，或拼音（全拼、首字母）都能快速找到；
 * 传了 stock（物品 id → 库存数量）就在每一项后面显示“现有库存”，没有库存的灰掉不能选（disableEmpty）。
 */
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import type { InventoryItem } from '../../api/types/inventory'
import { itemMatches } from '../../utils/item-search'

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined
    items: InventoryItem[]
    /** 物品 id → 库存数量；不传就不显示库存 */
    stock?: Map<string, number> | null
    disableEmpty?: boolean
    placeholder?: string
  }>(),
  { stock: null, disableEmpty: false, placeholder: '搜索物品：名称 / 规格 / 拼音首字母' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const options = computed(() => {
  const list = props.items.map((i) => ({ i, q: props.stock ? (props.stock.get(i.id) ?? 0) : null }))
  // 有库存的排前面
  if (props.stock) list.sort((a, b) => (b.q! > 0 ? 1 : 0) - (a.q! > 0 ? 1 : 0))
  return list.map(({ i, q }) => ({
    value: i.id,
    label: `${i.name}${i.spec ? ' ' + i.spec : ''}${i.brand ? ' · ' + i.brand : ''}（${i.unit}）${q === null ? '' : ` · 现有库存 ${q}${q <= 0 ? '（无库存）' : ''}`}`,
    disabled: props.disableEmpty && q !== null && q <= 0,
    item: i,
  }))
})
const filter = (pattern: string, option: unknown) => itemMatches((option as { item: InventoryItem }).item, pattern)
</script>

<template>
  <n-select
    :value="modelValue || null"
    :options="options"
    :filter="filter"
    filterable
    :consistent-menu-width="false"
    :placeholder="placeholder"
    @update:value="(v: string) => emit('update:modelValue', v)"
  />
</template>
