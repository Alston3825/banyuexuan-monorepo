/** 物品名称相似度（新物品入库时和物品库里已有的比，避免“保鲜膜”“一次性保鲜膜”各建一份）。 */
export const normName = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[\s·.。、,，:：;；()（）【】\[\]\-_*/\\|]/g, '');

const bigrams = (t: string): Set<string> => {
  const out = new Set<string>();
  if (t.length === 1) out.add(t);
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};

/** 0~1：名称完全一样 = 1；一个名称包含另一个（至少 2 个字）= 0.85；否则按二字词重合度（Dice）算 */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 2 && long.includes(short)) return 0.85;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let hit = 0;
  for (const g of gx) if (gy.has(g)) hit++;
  return (2 * hit) / (gx.size + gy.size);
}
