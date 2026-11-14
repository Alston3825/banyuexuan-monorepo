import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { DataScopeType } from '@prisma/client';
import { PermissionLookupService } from './permission-lookup.service';

export interface ScopeGrant {
  scopeType: DataScopeType;
  scopeId: string | null;
}

/**
 * 请求级上下文：账号身份 + 权限点集合 + 数据范围授权，懒加载并在同一请求内缓存，
 * 避免同一请求内多次查询权限/授权数据。供普通 controller/service 注入使用；
 * 全局 Guard/Interceptor 不能依赖这个（REQUEST-scoped），改用 PermissionLookupService。
 */
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private permissionCodes: Set<string> | null = null;
  private scopeGrants: ScopeGrant[] | null = null;

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  get accountId(): string | undefined {
    return (this.request as any).user?.accountId;
  }

  get tenantId(): string | undefined {
    return (this.request as any).user?.tenantId;
  }

  get homeStoreId(): string | null | undefined {
    return (this.request as any).user?.storeId;
  }

  get ip(): string | undefined {
    return this.request.ip;
  }

  get userAgent(): string | undefined {
    return this.request.headers['user-agent'];
  }

  get requestId(): string | undefined {
    return (this.request as any).requestId;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.permissionCodes && this.scopeGrants) return;
    this.permissionCodes = await this.permissionLookup.getPermissionCodes(this.accountId);
    this.scopeGrants = await this.permissionLookup.getScopeGrants(this.accountId);
  }

  async getPermissionCodes(): Promise<Set<string>> {
    await this.ensureLoaded();
    return this.permissionCodes!;
  }

  async hasPermission(code: string): Promise<boolean> {
    const codes = await this.getPermissionCodes();
    return codes.has(code);
  }

  async getScopeGrants(): Promise<ScopeGrant[]> {
    await this.ensureLoaded();
    return this.scopeGrants!;
  }
}
