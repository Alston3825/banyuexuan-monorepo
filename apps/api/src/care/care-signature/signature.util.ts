import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const PNG_PREFIX = 'data:image/png;base64,';

/**
 * 校验并返回签名图（PNG 的 data URL）。限制 < 200KB；太小 = 基本是空白画布（没写字），拒绝。
 * 前端已经裁掉空白边并检查过笔迹，这里是服务端兜底，不信任前端。
 */
export function assertSignatureImage(data: unknown): string {
  if (typeof data !== 'string' || !data.startsWith(PNG_PREFIX)) throw new BadRequestException('签名图格式不对，请重新签名');
  const b64 = data.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new BadRequestException('签名图格式不对，请重新签名');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > 200 * 1024) throw new BadRequestException('签名图太大，请重新签名');
  if (bytes.length < 700 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new BadRequestException('没有检测到签名笔迹，请在框里签上您的名字');
  return data;
}

/** 规范化后求指纹：键排序、去掉 null/空值和元数据，同样的内容一定得到同样的指纹。 */
const SKIP_KEYS = new Set(['id', 'tenantId', 'storeId', 'motherProfileId', 'dailyRecordId', 'babyDailyId', 'createdBy', 'createdAt', 'updatedAt', 'version', 'documentId']);
function canon(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (SKIP_KEYS.has(k)) continue;
      const c = canon((v as Record<string, unknown>)[k]);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v;
}
export function contentHash(record: unknown): string {
  return createHash('sha256').update(JSON.stringify(canon(record))).digest('hex');
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('hex');

/** 无状态的签名令牌：base64url(JSON).hmac。用于客户确认页的“已核验本人”会话和“看过内容”凭证。 */
export function signToken(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}
export function verifyToken<T extends Record<string, unknown>>(token: unknown, secret: string): T | null {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** 设备号：前端在浏览器本地生成的随机串，格式不对就当没有。 */
export function cleanDeviceId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? raw : null;
}

export const maskName = (name: string) => (name.length <= 1 ? '*' : name[0] + '*'.repeat(Math.min(name.length - 1, 3)));
