import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
type Row = Record<string, unknown>;

/**
 * 回收站的底层：把“某条记录 + 所有直接/间接挂在它下面的数据”收集成快照、删除、再原样还原。
 * 不手写每张表，而是读数据库的外键关系自动找“谁引用了它”，所以以后新增的业务表也自动包含在内。
 * - 引用它的行：必填关联 → 随它一起删；选填关联（第二层以下）→ 只把关联置空，还原时再接回去；
 * - 多态关联（没有外键的 标签绑定/跟进记录/审批实例）由调用方通过 extras 补充。
 */
export interface TableRows {
  table: string;
  rows: Row[];
}
export interface NullEdit {
  table: string;
  column: string;
  items: { id: string; value: unknown }[];
}
export interface TreeSnapshot {
  version: 1;
  /** 删除顺序：先子后父；还原时倒序 */
  groups: TableRows[];
  nulls: NullEdit[];
}

interface Referrer {
  table: string;
  column: string;
  nullable: boolean;
}

export interface CollectOptions {
  /** 第一层里“选填关联也算它的数据、要删”以外，需要保留并只置空的列，形如 leads.customer_id */
  keepNullables?: string[];
}

const CHUNK = 400;
const q = (name: string) => '`' + name.replace(/`/g, '') + '`';
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class TreeCollector {
  private readonly referrerCache = new Map<string, Referrer[]>();
  private readonly pkCache = new Map<string, boolean>();
  readonly seen = new Map<string, Set<string>>();
  readonly groups: TableRows[] = [];
  readonly nulls: NullEdit[] = [];
  private readonly keep: Set<string>;

  constructor(private readonly db: Db, opts: CollectOptions = {}) {
    this.keep = new Set(opts.keepNullables ?? []);
  }

  idsOf(table: string): string[] {
    return [...(this.seen.get(table) ?? [])];
  }

  /** 从 table 的这些 id 开始收集；depth=0 表示根（直接引用根的选填关联也算根的数据）。 */
  async collect(table: string, ids: string[], depth = 0): Promise<void> {
    const fresh = ids.filter((i) => !this.seen.get(table)?.has(i));
    if (fresh.length === 0) return;
    if (!this.seen.has(table)) this.seen.set(table, new Set());
    for (const i of fresh) this.seen.get(table)!.add(i);
    await this.assertHasIdPk(table);

    for (const ref of await this.referrers(table)) {
      const rows: { id: string }[] = [];
      for (const part of chunks(fresh)) {
        rows.push(...(await this.db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${q(ref.table)} WHERE ${q(ref.column)} IN (${placeholders(part.length)})`, ...part)));
      }
      if (rows.length === 0) continue;
      const asNull = ref.nullable && (depth > 0 || this.keep.has(`${ref.table}.${ref.column}`));
      if (asNull) {
        const items: NullEdit['items'] = [];
        for (const part of chunks(rows.map((r) => r.id))) {
          const cur = await this.db.$queryRawUnsafe<Row[]>(`SELECT id, ${q(ref.column)} AS v FROM ${q(ref.table)} WHERE id IN (${placeholders(part.length)})`, ...part);
          for (const c of cur) items.push({ id: String(c.id), value: c.v });
        }
        this.nulls.push({ table: ref.table, column: ref.column, items });
      } else {
        await this.collect(ref.table, rows.map((r) => r.id), depth + 1);
      }
    }

    const data: Row[] = [];
    for (const part of chunks(fresh)) {
      data.push(...(await this.db.$queryRawUnsafe<Row[]>(`SELECT * FROM ${q(table)} WHERE id IN (${placeholders(part.length)})`, ...part)));
    }
    if (data.length > 0) this.groups.push({ table, rows: data });
  }

  /** 没有外键的多态关联：按条件找到这些行，当作根的数据一并收集。 */
  async collectWhere(table: string, where: string, params: unknown[]): Promise<void> {
    const rows = await this.db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${q(table)} WHERE ${where}`, ...params);
    await this.collect(table, rows.map((r) => r.id), 0);
  }

  /** 把 id 在给定列表里的行（按列名）收集——用于“引用了已收集 id 的多态行”，分批查询。 */
  async collectByIdColumn(table: string, column: string, ids: string[], extraWhere = '', extraParams: unknown[] = []): Promise<void> {
    for (const part of chunks(ids)) {
      await this.collectWhere(table, `${q(column)} IN (${placeholders(part.length)})${extraWhere ? ' AND ' + extraWhere : ''}`, [...part, ...extraParams]);
    }
  }

  snapshot(): TreeSnapshot {
    return { version: 1, groups: this.groups, nulls: this.nulls };
  }

  private async assertHasIdPk(table: string): Promise<void> {
    const cached = this.pkCache.get(table);
    if (cached === false) throw new Error(`表 ${table} 没有单列 id 主键，回收站暂不支持`);
    if (cached) return;
    const cols = await this.db.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      table,
    );
    const pk = await this.db.$queryRawUnsafe<{ c: string }[]>(
      `SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      table,
    );
    const ok = Number(cols[0]?.n) === 1 && pk[0]?.c === 'id';
    this.pkCache.set(table, ok);
    if (!ok) throw new Error(`表 ${table} 没有单列 id 主键，回收站暂不支持`);
  }

  async referrers(table: string): Promise<Referrer[]> {
    const hit = this.referrerCache.get(table);
    if (hit) return hit;
    const rows = await this.db.$queryRawUnsafe<{ t: string; c: string; n: string; k: string }[]>(
      `SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, col.IS_NULLABLE AS n, k.CONSTRAINT_NAME AS k
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.COLUMNS col ON col.TABLE_SCHEMA = k.TABLE_SCHEMA AND col.TABLE_NAME = k.TABLE_NAME AND col.COLUMN_NAME = k.COLUMN_NAME
       WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = ? AND k.REFERENCED_COLUMN_NAME = 'id'`,
      table,
    );
    const out: Referrer[] = rows.map((r) => ({ table: r.t, column: r.c, nullable: r.n === 'YES' }));
    this.referrerCache.set(table, out);
    return out;
  }
}

// ———— 序列化：把 Date/BigInt/Buffer/Decimal 存成带标记的 JSON，还原时再变回来 ————

export function serializeSnapshot(snap: TreeSnapshot): string {
  return JSON.stringify(snap, function (this: Record<string, unknown>, key: string, value: unknown) {
    const raw = this[key];
    if (raw instanceof Date) return { $d: raw.toISOString() };
    if (typeof raw === 'bigint') return { $n: raw.toString() };
    if (Buffer.isBuffer(raw)) return { $b: raw.toString('base64') };
    if (raw instanceof Prisma.Decimal) return { $m: raw.toString() };
    return value;
  });
}

export function parseSnapshot(text: string): TreeSnapshot {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length === 1) {
        if (keys[0] === '$d') return new Date(v.$d);
        if (keys[0] === '$n') return BigInt(v.$n);
        if (keys[0] === '$b') return Buffer.from(v.$b, 'base64');
        if (keys[0] === '$m') return v.$m as string;
      }
    }
    return v;
  }) as TreeSnapshot;
}

/** 参数化写入前把普通对象/数组（JSON 列）转成文本 */
function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date || Buffer.isBuffer(v) || typeof v === 'bigint') return v;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ———— 删除 / 还原 ————

export async function deleteSnapshot(tx: Db, snap: TreeSnapshot): Promise<void> {
  for (const n of snap.nulls) {
    for (const part of chunks(n.items.map((i) => i.id))) {
      await tx.$executeRawUnsafe(`UPDATE ${q(n.table)} SET ${q(n.column)} = NULL WHERE id IN (${placeholders(part.length)})`, ...part);
    }
  }
  for (const g of snap.groups) {
    for (const part of chunks(g.rows.map((r) => String(r.id)))) {
      await tx.$executeRawUnsafe(`DELETE FROM ${q(g.table)} WHERE id IN (${placeholders(part.length)})`, ...part);
    }
  }
}

export async function restoreSnapshot(tx: Db, snap: TreeSnapshot): Promise<void> {
  for (const g of [...snap.groups].reverse()) {
    if (g.rows.length === 0) continue;
    const cols = Object.keys(g.rows[0]);
    for (const part of chunks(g.rows, 100)) {
      const one = `(${placeholders(cols.length)})`;
      await tx.$executeRawUnsafe(
        `INSERT INTO ${q(g.table)} (${cols.map(q).join(',')}) VALUES ${part.map(() => one).join(',')}`,
        ...part.flatMap((r) => cols.map((c) => toParam(r[c]))),
      );
    }
  }
  for (const n of snap.nulls) {
    for (const it of n.items) {
      // 接回关联：行已不存在、或被关联的对象已不在，就跳过（不阻塞还原）
      await tx.$executeRawUnsafe(`UPDATE ${q(n.table)} SET ${q(n.column)} = ? WHERE id = ? AND ${q(n.column)} IS NULL`, toParam(it.value), it.id).catch(() => undefined);
    }
  }
}

const LABELS: Record<string, string> = {
  customers: '客户',
  contracts: '合同',
  room_occupancies: '预订/入住记录',
  payments: '收款',
  customer_accounts: '会员账户',
  customer_service_packages: '已购服务包',
  service_appointments: '产康预约',
  diner_profiles: '用膳档案',
  mother_profiles: '母婴档案',
  baby_profiles: '宝宝档案',
  sales_opportunities: '销售机会',
  follow_up_records: '跟进记录',
  care_records: '护理记录',
  care_plans: '护理计划',
  care_documents: '纸质资料',
};

export function summarizeSnapshot(snap: TreeSnapshot, skipTable?: string): string {
  const parts: string[] = [];
  for (const g of snap.groups) {
    if (g.table === skipTable) continue;
    const label = LABELS[g.table];
    if (label) parts.push(`${g.rows.length} ${label}`);
  }
  const other = snap.groups.filter((g) => g.table !== skipTable && !LABELS[g.table]).reduce((s, g) => s + g.rows.length, 0);
  if (other > 0) parts.push(`${other} 条其他关联记录`);
  return parts.join('、');
}

export { LABELS as TABLE_LABELS };
