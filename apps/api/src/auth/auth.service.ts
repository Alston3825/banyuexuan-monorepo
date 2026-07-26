import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditLogService } from '../audit/audit-log.service';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
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
  ) {}

  async login(username: string, password: string, meta: RequestMeta) {
    const account = await this.prisma.account.findFirst({ where: { username } });

    if (!account || account.status !== 'ACTIVE') {
      await this.auditLogService.record({
        action: 'LOGIN_FAILED',
        entityType: 'Account',
        remark: `username=${username}`,
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

    return {
      accessToken,
      refreshToken,
      account: { id: account.id, username: account.username, realName: account.realName },
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
    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
