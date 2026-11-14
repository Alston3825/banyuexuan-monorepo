/**
 * 手写签字识别后，和“账号管理里护理部员工的姓名”核对：笔迹潦草时 AI 常把一个字认错（乔燕→乔荣）或只认出半个名字。
 * 规则：完全一致 → 不动；和某位员工只差 1 个字、且是唯一最接近的 → 自动改成这位员工的名字（并标黄提示，让人确认）；
 * 同样接近的有好几位 → 不乱改，提示“可能是 A 或 B”；对不上任何人 → 保留原样并提示“护理部没有这个人”。
 */
export interface NameFix {
  /** 改成的名字（不改则为 null） */
  value: string | null;
  level: 'warn' | null;
  message: string | null;
}

export const NURSE_FIELD_KEYS = ['dayNurseName', 'nightNurseName', 'nurseName', 'responsibleNurseName', 'assessorName'];

const clean = (s: string) => s.replace(/[\s·.。、,，:：()（）\-_*/\\|]/g, '');

export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

export function matchNurseName(raw: unknown, roster: string[]): NameFix {
  const none: NameFix = { value: null, level: null, message: null };
  if (typeof raw !== 'string' || roster.length === 0) return none;
  const r = clean(raw);
  if (!r) return none;
  if (roster.includes(r)) return r === raw ? none : { value: r, level: null, message: null };
  const scored = roster.map((n) => ({ n, d: editDistance(r, n) })).sort((x, y) => x.d - y.d);
  const best = scored[0];
  if (best.d > 1) return { value: null, level: 'warn', message: `手写“${raw}”对不上护理部任何一位员工，请核对` };
  const ties = scored.filter((x) => x.d === best.d);
  if (ties.length === 1) return { value: best.n, level: 'warn', message: `手写“${raw}”已按护理部员工核对为“${best.n}”，请确认` };
  return { value: null, level: 'warn', message: `手写“${raw}”可能是${ties.slice(0, 4).map((x) => `“${x.n}”`).join('或')}，请核对` };
}

/** 对一份识别结果里的所有护理师签字做核对：就地改 data，返回新增的提醒 */
export function applyNurseRoster(data: Record<string, unknown>, roster: string[]): { field: string; level: 'warn'; message: string }[] {
  const out: { field: string; level: 'warn'; message: string }[] = [];
  const handle = (holder: Record<string, unknown>, key: string, path: string) => {
    const fix = matchNurseName(holder[key], roster);
    if (fix.value !== null) holder[key] = fix.value;
    if (fix.level && fix.message) out.push({ field: path, level: fix.level, message: fix.message });
  };
  for (const [k, v] of Object.entries(data)) {
    if (NURSE_FIELD_KEYS.includes(k) && typeof v === 'string') handle(data, k, k);
    else if (Array.isArray(v)) {
      v.forEach((row, i) => {
        if (row && typeof row === 'object') for (const key of NURSE_FIELD_KEYS) if (typeof (row as Record<string, unknown>)[key] === 'string') handle(row as Record<string, unknown>, key, `${k}.${i}.${key}`);
      });
    }
  }
  return out;
}

/** 把护理部员工名单写进 AI 的字段说明（让模型在字形接近时优先选名单里的人） */
export function withRosterHint<T extends { key: string; aiHint?: string; columns?: unknown[] }>(fields: T[], roster: string[]): T[] {
  if (roster.length === 0) return fields;
  const hint = `签字人只可能是这些护理部员工之一：${roster.join('、')}；按字形最接近的选，实在认不出再原样抄写`;
  const patch = (f: { key: string; aiHint?: string }) => (NURSE_FIELD_KEYS.includes(f.key) ? { ...f, aiHint: [f.aiHint, hint].filter(Boolean).join('；') } : f);
  return fields.map((f) => {
    const p = patch(f) as T;
    return Array.isArray(f.columns) ? ({ ...p, columns: (f.columns as { key: string; aiHint?: string }[]).map(patch) } as T) : p;
  });
}
