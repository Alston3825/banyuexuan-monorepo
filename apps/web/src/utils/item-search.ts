import { pinyin } from 'pinyin-pro'

/**
 * 物品搜索：名称 / 规格 / 品牌 / 编码 / 分类 都能搜；中文名还能用拼音搜（全拼 `baoxianmo` 或首字母 `bxm`）。
 * 库存模块里所有“选物品”的下拉、“按物品找单据/明细”的搜索框共用这一份，保证大家搜出来的结果一致。
 */
export interface SearchableItem {
  name: string
  spec?: string | null
  brand?: string | null
  code?: string | null
  category?: string | null
}

const cache = new Map<string, { full: string; initials: string }>()
function py(text: string) {
  let hit = cache.get(text)
  if (!hit) {
    hit = {
      full: pinyin(text, { toneType: 'none', type: 'array', nonZh: 'removed' }).join(''),
      initials: pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'removed' }).join(''),
    }
    cache.set(text, hit)
  }
  return hit
}

/** 关键字（空格分隔的多个词，每个词都要命中）是否匹配这个物品 */
export function itemMatches(item: SearchableItem, keyword: string): boolean {
  const words = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = [item.name, item.spec, item.brand, item.code, item.category].filter(Boolean).join(' ').toLowerCase()
  const p = py(item.name)
  return words.every((w) => text.includes(w) || p.full.includes(w) || p.initials.includes(w))
}

/** 单据（申购单/采购单/入库单…）按 单号、仓库/供应商等文字、或它里面任一物品 搜索 */
export function docMatches(keyword: string, texts: (string | null | undefined)[], lines: { item?: SearchableItem | null; name?: string | null; spec?: string | null }[] = []): boolean {
  const k = keyword.trim().toLowerCase()
  if (!k) return true
  if (texts.some((t) => (t ?? '').toLowerCase().includes(k))) return true
  return lines.some((l) => {
    if (l.item) return itemMatches(l.item, keyword)
    if (l.name) return itemMatches({ name: l.name, spec: l.spec }, keyword)
    return false
  })
}
