import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { allFields, FieldSpec, FormSpec } from './assessment-specs';

const MAX_TEXT = 200;
const MAX_LONGTEXT = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** 单个字段：把前端/AI 传来的值规整成可入库的值；不合法抛出说明。返回 undefined 表示"不修改"。 */
function convert(f: FieldSpec, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (isBlank(v)) return f.kind === 'multi' ? Prisma.DbNull : null;
  switch (f.kind) {
    case 'text':
    case 'longtext': {
      const s = String(v).trim();
      const max = f.kind === 'text' ? MAX_TEXT : MAX_LONGTEXT;
      if (s.length > max) throw new Error(`${f.label}太长（最多 ${max} 个字）`);
      return s || null;
    }
    case 'int': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${f.label}必须是数字`);
      return Math.round(n);
    }
    case 'decimal': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${f.label}必须是数字`);
      return n;
    }
    case 'date': {
      const s = String(v);
      if (!DATE_RE.test(s)) throw new Error(`${f.label}日期格式不正确（应为 YYYY-MM-DD）`);
      const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) throw new Error(`${f.label}不是有效日期`);
      return d;
    }
    case 'single': {
      const s = String(v);
      if (!f.options!.some((o) => o.value === s)) throw new Error(`${f.label}的取值「${s}」不在可选项里`);
      return s;
    }
    case 'multi': {
      const arr = Array.isArray(v) ? v.map(String) : [String(v)];
      const bad = arr.find((x) => !f.options!.some((o) => o.value === x));
      if (bad) throw new Error(`${f.label}的取值「${bad}」不在可选项里`);
      return [...new Set(arr)];
    }
  }
}

/**
 * 按字段说明书校验并转换一整份表单的值。只认说明书里有的字段（多余的忽略），
 * 没传的字段不动（undefined），显式传 null/空 表示清空。所有问题一次性报出来。
 */
export function toDbData(spec: FormSpec, values: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of allFields(spec)) {
    try {
      const out = convert(f, values[f.key]);
      if (out !== undefined) data[f.key] = out;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (errors.length > 0) throw new BadRequestException(errors.join('；'));
  return data;
}
