import { PrismaService } from '../../prisma/prisma.service';

/**
 * 下一个可用的员工工号。工号唯一只在“在册”员工里算（离职归档后工号释放，可回收）：
 * 在册工号都是纯数字时 = 最大值 + 1（保持原来的位数，如 009 → 010）；有非数字工号时退回 “E + 序号”。
 * 已经被释放的小号不自动回填（避免新员工拿到刚离职的人的旧工号，造成记录混淆），需要回收时手工输入即可。
 */
export async function nextEmployeeNo(prisma: PrismaService, tenantId: string, alsoTaken: Iterable<string> = []): Promise<string> {
  const rows = await prisma.employeeProfile.findMany({ where: { tenantId, activeEmployeeNo: { not: null } }, select: { activeEmployeeNo: true } });
  const taken = new Set<string>([...rows.map((r) => r.activeEmployeeNo as string), ...alsoTaken]);
  const nums = [...taken].filter((n) => /^\d+$/.test(n));
  const allNumeric = nums.length === taken.size;
  const width = Math.max(3, ...nums.map((n) => n.length));
  let n = Math.max(0, ...nums.map(Number)) + 1;
  const make = (i: number) => (allNumeric ? String(i).padStart(width, '0') : `E${String(i).padStart(3, '0')}`);
  while (taken.has(make(n))) n += 1;
  return make(n);
}

/** 手机号规范化：去掉空格、横线、+86；返回 11 位大陆手机号，格式不对返回 null。 */
export function normalizeMobile(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/[\s-]/g, '').replace(/^\+?86/, '');
  return /^1[3-9]\d{9}$/.test(digits) ? digits : null;
}
