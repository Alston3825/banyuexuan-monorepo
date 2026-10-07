import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditLogService } from '../audit/audit-log.service';
import { PermissionLookupService } from '../common/context/permission-lookup.service';
import { normalizeMobile } from '../common/utils/employee-no.util';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  /** 浏览器本地生成的设备号（X-Device-Id），用来识别“这台手机/电脑是员工用过的”，见 CareConfirmPublicService */
  deviceId?: string;
}

interface AccountForToken {
  id: string;
  tenantId: string;
  storeId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly auditLogService: AuditLogService,
    private readonly permissionLookupService: PermissionLookupService,
  ) {}

  async login(username: string, password: string, meta: RequestMeta) {
    // 用户名或手机号都能登录：先按用户名找（管理员 admin 等），找不到再按手机号找（手机号在同一租户内唯一）
    const key = username.trim();
    let account = await this.prisma.account.findFirst({ where: { username: key } });
    if (!account) {
      const phone = normalizeMobile(key);
      if (phone) account = await this.prisma.account.findFirst({ where: { phone } });
    }

    if (!account || account.status !== 'ACTIVE') {
      await this.auditLogService.record({
        action: 'LOGIN_FAILED',
        entityType: 'Account',
        remark: `username=${key}`,
        result: 'FAILURE',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordOk = await this.passwordService.compare(password, account.passwordHash);
    if (!passwordOk) {
      await this.auditLogService.record({
        action: 'LOGIN_FAILED',
        entityType: 'Account',
        entityId: account.id,
        tenantId: account.tenantId,
        accountId: account.id,
        result: 'FAILURE',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    const accessToken = this.signAccessToken(account);
    const refreshToken = await this.issueRefreshToken(account.id, meta);
    await this.touchDevice(account.id, meta);

    await this.prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    await this.auditLogService.record({
      action: 'LOGIN',
      entityType: 'Account',
      entityId: account.id,
      tenantId: account.tenantId,
      storeId: account.storeId,
      accountId: account.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // 权限点code列表下发给前端，用来算导航菜单该显示哪些模块（见nav-menu.ts）——
    // 前端本身不做真正的鉴权判断，隐藏看不到的入口只是体验优化，接口层的@RequirePermission
    // /PermissionGuard才是真正兜底的那一层，即使前端算错了也不会导致越权访问。
    const permissions = Array.from(await this.permissionLookupService.getPermissionCodes(account.id)).sort();

    return {
      accessToken,
      refreshToken,
      account: { id: account.id, username: account.username, realName: account.realName },
      permissions,
    };
  }

  async refresh(rawRefreshToken: string, meta: RequestMeta) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }

    // 轮换：撤销旧 token，签发新的一对
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    const accessToken = this.signAccessToken(record.account);
    const newRefreshToken = await this.issueRefreshToken(record.accountId, meta);
    await this.touchDevice(record.accountId, meta);
    // 每次静默刷新时都重新取一遍权限点：管理员改了这个账号的角色后，不需要等对方
    // 主动退出重新登录，下一次刷新（access token每30分钟过期一次）就能拿到最新权限。
    const permissions = Array.from(await this.permissionLookupService.getPermissionCodes(record.accountId)).sort();
    return { accessToken, refreshToken: newRefreshToken, permissions };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 记录员工登录过的设备号（格式不对就忽略，记录失败也不能影响登录）。 */
  private async touchDevice(accountId: string, meta: RequestMeta): Promise<void> {
    const deviceId = meta.deviceId;
    if (!deviceId || !/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) return;
    try {
      await this.prisma.staffDevice.upsert({
        where: { accountId_deviceId: { accountId, deviceId } },
        update: { lastSeenAt: new Date(), lastIp: meta.ip ?? null },
        create: { accountId, deviceId, lastIp: meta.ip ?? null },
      });
    } catch {
      /* 设备记录只是辅助证据，不影响登录 */
    }
  }

  private signAccessToken(account: AccountForToken): string {
    return this.jwtService.sign(
      { sub: account.id, tenantId: account.tenantId, storeId: account.storeId },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        // expiresIn 运行时接受 "30m"/"14d" 这类字符串，ms 包的字面量类型对动态配置值过于严格
        expiresIn: (this.configService.get<string>('JWT_ACCESS_TTL') ?? '30m') as any,
      },
    );
  }

  private async issueRefreshToken(accountId: string, meta: RequestMeta): Promise<string> {
    const raw = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(raw);
    const ttlDays = Number(this.configService.get<string>('JWT_REFRESH_TTL_DAYS') ?? 14);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { accountId, tokenHash, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
    });
    return raw;
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
