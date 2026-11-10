import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface IntegrationCaller {
  systemId: string;
  code: string;
  tenantId: string;
  /** 为空 = 可访问租户内所有门店 */
  storeId: string | null;
}

export const hashApiKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

/** 外部系统（呼叫定位系统等）用 API Key 访问 /integration/v1/*：Authorization: Bearer bmx_xxx 或 X-Api-Key */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = String(req.headers['authorization'] ?? '');
    const key = (auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-api-key'] ?? '')).trim();
    if (!key.startsWith('bmx_')) throw new UnauthorizedException('缺少或无效的 API Key');
    const sys = await this.prisma.integrationSystem.findUnique({ where: { apiKeyHash: hashApiKey(key) } });
    if (!sys || !sys.enabled) throw new UnauthorizedException('API Key 无效或该系统已停用');
    if (!sys.lastSeenAt || Date.now() - sys.lastSeenAt.getTime() > 60_000) {
      await this.prisma.integrationSystem.update({ where: { id: sys.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    req.integration = { systemId: sys.id, code: sys.code, tenantId: sys.tenantId, storeId: sys.storeId } satisfies IntegrationCaller;
    return true;
  }
}
