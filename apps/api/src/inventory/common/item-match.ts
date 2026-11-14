import { pinyin } from 'pinyin-pro';

/** 物品搜索（服务端）：名称/规格/品牌/编码/分类，中文名还支持拼音（全拼或首字母）。与前端 utils/item-search.ts 规则一致。 */
export interface MatchableItem {
  name: string;
  spec?: string | null;
  brand?: string | null;
  code?: string | null;
  category?: string | null;
}

const cache = new Map<string, { full: string; initials: string }>();
function py(text: string) {
  let hit = cache.get(text);
  if (!hit) {
    hit = {
      full: pinyin(text, { toneType: 'none', type: 'array', nonZh: 'removed' }).join(''),
      initials: pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'removed' }).join(''),
    };
    cache.set(text, hit);
  }
  return hit;
}

export function itemMatchesKeyword(item: MatchableItem, keyword: string | undefined | null): boolean {
  const words = (keyword ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [item.name, item.spec, item.brand, item.code, item.category].filter(Boolean).join(' ').toLowerCase();
  const p = py(item.name);
  return words.every((w) => text.includes(w) || p.full.includes(w) || p.initials.includes(w));
}
