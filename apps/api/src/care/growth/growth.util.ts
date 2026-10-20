import { GrowthMetric, GrowthSex, WS423, WS423_PERCENTILES, WS423_SOURCE } from './ws423-data';
import { WHO_DAILY, WHO_MAX_DAYS, WHO_SOURCE } from './who-data';

/** CN = 国家卫健委 WS/T 423—2022；WHO = 世界卫生组织儿童生长标准 */
export type GrowthStandard = 'CN' | 'WHO';
export const STANDARD_INFO: Record<GrowthStandard, { label: string; source: string }> = {
  CN: { label: '国家卫健委标准', source: WS423_SOURCE },
  WHO: { label: 'WHO 标准', source: WHO_SOURCE },
};
export const parseStandard = (v: unknown): GrowthStandard => (String(v).toUpperCase() === 'WHO' ? 'WHO' : 'CN');

const DAY_MS = 86_400_000;
export const MONTH_DAYS = 30.4375;

export const METRIC_LABEL: Record<GrowthMetric, { name: string; unit: string }> = {
  weight: { name: '体重', unit: 'kg' },
  length: { name: '身长', unit: 'cm' },
  head: { name: '头围', unit: 'cm' },
};

/** 标准给的月龄（0..24 每月一行，之后每 3 个月一行）排序后的列表，按指标/性别缓存 */
const agesCache = new Map<string, number[]>();
function agesOf(metric: GrowthMetric, sex: GrowthSex): number[] {
  const k = `${metric}|${sex}`;
  let a = agesCache.get(k);
  if (!a) {
    a = Object.keys(WS423[metric][sex]).map(Number).sort((x, y) => x - y);
    agesCache.set(k, a);
  }
  return a;
}

export const maxAgeMonths = (metric: GrowthMetric) => agesOf(metric, 'MALE').at(-1)!;

/** 某个（可以带小数的）月龄上的 P3..P97，相邻两个标准月龄之间线性插值；超出标准范围返回 null */
export function standardRow(metric: GrowthMetric, sex: GrowthSex, ageMonths: number, standard: GrowthStandard = 'CN'): number[] | null {
  if (standard === 'WHO') return whoRow(metric, sex, ageMonths);
  const ages = agesOf(metric, sex);
  if (ageMonths < 0 || ageMonths > ages.at(-1)!) return null;
  const table = WS423[metric][sex];
  let lo = ages[0];
  for (const a of ages) {
    if (a <= ageMonths) lo = a;
    else {
      const hi = a;
      const t = (ageMonths - lo) / (hi - lo);
      return table[lo].map((v, i) => Math.round((v + (table[hi][i] - v) * t) * 100) / 100);
    }
  }
  return table[lo];
}

/** WHO 按日表：按天数线性插值；超过 91 天（约 3 个月）没有数据 */
function whoRow(metric: GrowthMetric, sex: GrowthSex, ageMonths: number): number[] | null {
  const days = ageMonths * MONTH_DAYS;
  if (days < 0 || days > WHO_MAX_DAYS + 1) return null;
  const t = WHO_DAILY[metric][sex];
  const d = Math.min(days, WHO_MAX_DAYS);
  const lo = Math.floor(d);
  const hi = Math.min(lo + 1, WHO_MAX_DAYS);
  const f = d - lo;
  return t[lo].map((v, i) => Math.round((v + (t[hi][i] - v) * f) * 1000) / 1000);
}

export type Rating = '上' | '中上' | '中' | '中下' | '下';

/** 按标准表 1：≥P97 上；P75~P97 中上；P25~P75 中；P3~P25 中下；<P3 下 */
export function rate(value: number, row: number[]): Rating {
  if (value >= row[6]) return '上';
  if (value >= row[4]) return '中上';
  if (value >= row[2]) return '中';
  if (value >= row[0]) return '中下';
  return '下';
}

/** 在 P3/P10/P25/P50/P75/P90/P97 之间线性估算百分位；低于 P3 / 高于 P97 返回 null 并标记方向 */
export function estimatePercentile(value: number, row: number[]): { pct: number | null; beyond: 'below' | 'above' | null } {
  if (value < row[0]) return { pct: null, beyond: 'below' };
  if (value > row[6]) return { pct: null, beyond: 'above' };
  for (let i = 0; i < 6; i++) {
    if (value <= row[i + 1]) {
      const t = row[i + 1] === row[i] ? 0 : (value - row[i]) / (row[i + 1] - row[i]);
      return { pct: Math.round(WS423_PERCENTILES[i] + (WS423_PERCENTILES[i + 1] - WS423_PERCENTILES[i]) * t), beyond: null };
    }
  }
  return { pct: 97, beyond: null };
}

/**
 * 月龄：从出生日到测量日的天数 / 30.4375。早产儿（孕周 < 37）在 2 岁前用矫正月龄（减去提前的周数）。
 * 矫正后还没到“足月”（负数）时返回 null：标准是足月儿的，没法比较。
 */
export function ageInMonths(birth: Date, at: Date, gestationalWeeks?: number | null): { months: number | null; days: number; corrected: boolean } {
  const days = Math.round((at.getTime() - birth.getTime()) / DAY_MS);
  if (gestationalWeeks && gestationalWeeks < 37 && days < 730) {
    const corrected = days - (40 - gestationalWeeks) * 7;
    return { months: corrected < 0 ? null : corrected / MONTH_DAYS, days, corrected: true };
  }
  return { months: days < 0 ? null : days / MONTH_DAYS, days, corrected: false };
}

export function describeMetric(metric: GrowthMetric, value: number, row: number[]): { rating: Rating; pctText: string; text: string } {
  const r = rate(value, row);
  const e = estimatePercentile(value, row);
  const pctText = e.pct !== null ? `约第 ${e.pct} 百分位` : e.beyond === 'below' ? '低于第 3 百分位' : '高于第 97 百分位';
  const { name, unit } = METRIC_LABEL[metric];
  const level = { 上: '偏高（上）', 中上: '中上', 中: '中等', 中下: '中下', 下: '偏低（下）' }[r];
  return { rating: r, pctText, text: `${name} ${value}${unit}：${pctText}，生长水平${level}` };
}
