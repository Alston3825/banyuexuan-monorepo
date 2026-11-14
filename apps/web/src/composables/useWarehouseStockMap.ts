import { ref, watch, type Ref } from 'vue'
import { warehouseStockApi } from '../api/modules/inventory.api'

/**
 * 某个仓库里每种物品的现有库存（物品 id → 数量）。选了仓库就自动取；取不到（没有查看库存的权限等）时 loaded=false，
 * 页面就不显示库存、也不在前端拦截（后端提交时仍会校验库存）。
 */
export function useWarehouseStockMap(warehouseId: Ref<string | null | undefined>) {
  const stock = ref<Map<string, number>>(new Map())
  const loaded = ref(false)
  const loading = ref(false)
  const failed = ref(false)
  let seq = 0
  async function load() {
    const my = ++seq
    stock.value = new Map()
    loaded.value = false
    failed.value = false
    if (!warehouseId.value) return
    loading.value = true
    try {
      const list = await warehouseStockApi.list({ warehouseId: warehouseId.value })
      if (my !== seq) return
      stock.value = new Map(list.map((s) => [s.itemId, s.quantity]))
      loaded.value = true
    } catch {
      /* 没权限取库存：不显示、不拦截 */
      if (my === seq) failed.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }
  watch(warehouseId, load)
  const stockOf = (itemId: string) => stock.value.get(itemId) ?? 0
  /** 这些行里，同一物品合计领用/调出数量超过现有库存的 */
  function overOf(rows: { itemId: string; quantity?: number | null }[]) {
    if (!loaded.value) return []
    const used = new Map<string, number>()
    for (const r of rows) if (r.itemId) used.set(r.itemId, (used.get(r.itemId) ?? 0) + (r.quantity ?? 0))
    return [...used.entries()].filter(([id, n]) => n > stockOf(id)).map(([id, n]) => ({ id, used: n, stock: stockOf(id) }))
  }
  return { stock, loaded, loading, failed, stockOf, overOf, reload: load }
}
