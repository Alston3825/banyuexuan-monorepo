import { randomBytes } from 'crypto';

/**
 * 业务单号：日期前缀 + 6 位随机十六进制后缀，本地单节点/双门店规模下足够唯一，
 * 不引入独立的序列计数器表。真正的唯一性由数据库 @@unique([tenantId, xxxNo]) 兜底；
 * 调用方在极小概率冲突时应捕获 Prisma 唯一约束错误（P2002）重试一次。
 */
export function generateBusinessNo(prefix: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const randPart = randomBytes(3).toString('hex').toUpperCase(); // 6 位十六进制
  return `${prefix}${datePart}${randPart}`;
}
