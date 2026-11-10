import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { PermissionLookupService } from '../common/context/permission-lookup.service';
import { normalizeMobile } from '../common/utils/employee-no.util';
import { IntegrationCaller } from './api-key.guard';
import { ensureServiceCodes } from './integration-admin.service';

const MAX_PAGE = 500;

function parseSince(since?: string): Date | undefined {
  if (!since) return undefined;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('updatedSince 必须是 ISO 时间，如 2026-11-10T08:00:00Z');
  return d;
}

/** 增量分页包装：rows 按 updatedAt 升序；nextSince 取最后一条的 updatedAt，下次带上即可继续 */
function paged<R extends { updatedAt: Date }, T>(rows: R[], map: (r: R) => T, ts: (r: R) => Date = (r) => r.updatedAt) {
  const last = rows[rows.length - 1];
  return {
    items: rows.map(map),
    count: rows.length,
    hasMore: rows.length >= MAX_PAGE,
    nextSince: last ? ts(last).toISOString() : null,
    serverTime: new Date().toISOString(),
  };
}

const iso = (d?: Date | null) => (d ? d.toISOString() : null);

/** 外部系统拉取/写回：所有方法显式带 caller（租户+门店范围），不依赖登录上下文 */
@Injectable()
export class IntegrationPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  /** 门店范围：key 限定了门店就只能看该店；传了 storeId 必须在范围内 */
  private storeScope(c: IntegrationCaller, storeId?: string): string | undefined {
    if (c.storeId && storeId && storeId !== c.storeId) throw new UnauthorizedException('该 API Key 无权访问此门店');
    return c.storeId ?? storeId;
  }

  // 1) 门店
  async stores(c: IntegrationCaller, since?: string) {
    const s = parseSince(since);
    const rows = await this.prisma.store.findMany({
      where: { tenantId: c.tenantId, ...(c.storeId ? { id: c.storeId } : {}), ...(s ? { updatedAt: { gt: s } } : {}) },
      orderBy: { updatedAt: 'asc' },
      take: MAX_PAGE,
    });
    return paged(rows, (r) => ({ store_id: r.id, store_code: r.code, name: r.name, address: r.address, status: r.status, updated_at: iso(r.updatedAt) }));
  }

  // 2) 楼层 + 房间（含设备绑定、房间当前状态）
  async rooms(c: IntegrationCaller, storeId?: string, since?: string) {
    const s = parseSince(since);
    const sid = this.storeScope(c, storeId);
    const rows = await this.prisma.room.findMany({
      where: {
        tenantId: c.tenantId,
        ...(sid ? { storeId: sid } : {}),
        ...(s ? { OR: [{ updatedAt: { gt: s } }, { deviceBindings: { some: { updatedAt: { gt: s } } } }] } : {}),
      },
      include: { roomType: { select: { code: true, name: true } }, deviceBindings: true },
      orderBy: { updatedAt: 'asc' },
      take: MAX_PAGE,
    });
    const inHouse = await this.prisma.roomOccupancy.findMany({
      where: { tenantId: c.tenantId, roomId: { in: rows.map((r) => r.id) }, status: 'CHECKED_IN' },
      select: { roomId: true, id: true },
    });
    const stayByRoom = new Map(inHouse.map((o) => [o.roomId, o.id]));
    return paged(rows, (r) => ({
      room_id: r.id,
      store_id: r.storeId,
      floor: r.floor,
      room_no: r.roomNo,
      room_type: r.roomType.code,
      room_type_name: r.roomType.name,
      status: r.underMaintenance ? 'MAINTENANCE' : stayByRoom.has(r.id) ? 'OCCUPIED' : r.needsCleaning ? 'PENDING_CLEANING' : 'FREE',
      current_stay_id: stayByRoom.get(r.id) ?? null,
      tablet_device_id: r.deviceBindings.find((b) => b.kind === 'TABLET')?.deviceCode ?? null,
      beacon_ids: r.deviceBindings.filter((b) => b.kind === 'BEACON').map((b) => b.deviceCode),
      updated_at: iso(r.updatedAt),
    }));
  }

  // 3) 员工（含手表、当班状态、负责楼层）
  async staff(c: IntegrationCaller, storeId?: string, since?: string) {
    const s = parseSince(since);
    const sid = this.storeScope(c, storeId);
    const rows = await this.prisma.account.findMany({
      where: {
        tenantId: c.tenantId,
        status: 'ACTIVE',
        ...(sid ? { storeId: sid } : {}),
        ...(s ? { OR: [{ updatedAt: { gt: s } }, { employeeProfile: { updatedAt: { gt: s } } }] } : {}),
      },
      include: {
        employeeProfile: true,
        roleAssignments: { where: { revokedAt: null }, include: { role: { select: { code: true, name: true } } } },
      },
      orderBy: { updatedAt: 'asc' },
      take: MAX_PAGE,
    });
    const staffTs = (a: (typeof rows)[number]) => new Date(Math.max(a.updatedAt.getTime(), a.employeeProfile?.updatedAt.getTime() ?? 0));
    return paged(rows, (a) => ({
      staff_id: a.id,
      store_id: a.storeId,
      name: a.realName,
      phone: a.phone,
      employee_no: a.employeeProfile?.employeeNo ?? null,
      roles: [...new Set(a.roleAssignments.map((x) => x.role.code))],
      watch_id: a.employeeProfile?.watchId ?? null,
      duty_status: a.employeeProfile?.dutyStatus ?? 'OFF_DUTY',
      responsible_floors: (a.employeeProfile?.responsibleFloors as string[] | null) ?? [],
      employed: !a.employeeProfile || a.employeeProfile.status !== 'TERMINATED',
      updated_at: iso(staffTs(a)),
    }), staffTs);
  }

  // 4) 入住（stay）：含客户称呼与宝宝信息
  async stays(c: IntegrationCaller, storeId?: string, since?: string, status?: string) {
    const s = parseSince(since);
    const sid = this.storeScope(c, storeId);
    const statuses = status ? status.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const rows = await this.prisma.roomOccupancy.findMany({
      where: {
        tenantId: c.tenantId,
        ...(sid ? { storeId: sid } : {}),
        ...(statuses ? { status: { in: statuses as any } } : {}),
        ...(s ? { updatedAt: { gt: s } } : {}),
      },
      include: { customer: { select: { id: true, customerNo: true, name: true, salutation: true } }, room: { select: { roomNo: true, floor: true } } },
      orderBy: { updatedAt: 'asc' },
      take: MAX_PAGE,
    });
    const babies = await this.prisma.babyProfile.findMany({
      where: { tenantId: c.tenantId, customerId: { in: [...new Set(rows.map((r) => r.customerId))] } },
      orderBy: { sequenceNo: 'asc' },
    });
    const babyBy = new Map<string, typeof babies>();
    for (const b of babies) babyBy.set(b.customerId, [...(babyBy.get(b.customerId) ?? []), b]);
    return paged(rows, (o) => ({
      stay_id: o.id,
      stay_no: o.occupancyNo,
      store_id: o.storeId,
      room_id: o.roomId,
      room_no: o.room.roomNo,
      floor: o.room.floor,
      customer_id: o.customerId,
      customer_no: o.customer.customerNo,
      mother_name: o.customer.name,
      salutation: o.customer.salutation || `${o.customer.name.slice(0, 1)}女士`,
      babies: (babyBy.get(o.customerId) ?? []).map((b) => ({ baby_id: b.id, name: b.name, gender: b.gender, birth_date: iso(b.birthDate) })),
      status: o.status,
      planned_check_in: iso(o.plannedCheckIn),
      planned_check_out: iso(o.plannedCheckOut),
      actual_check_in_at: iso(o.actualCheckInAt),
      actual_check_out_at: iso(o.actualCheckOutAt),
      updated_at: iso(o.updatedAt),
    }));
  }

  // 5) 服务项字典
  async serviceCodes(c: IntegrationCaller) {
    await ensureServiceCodes(this.prisma, c.tenantId);
    const rows = await this.prisma.serviceCatalogItem.findMany({ where: { tenantId: c.tenantId, status: 'ACTIVE' }, orderBy: { sortNo: 'asc' } });
    return { items: rows.map((r) => ({ service_code: r.serviceCode, name: r.name, category: r.category })), count: rows.length, serverTime: new Date().toISOString() };
  }

  // 事件拉取（兜底；MQTT 掉线时用）：afterSeq 为上次拿到的最大 seq
  async events(c: IntegrationCaller, storeId?: string, afterSeq?: string) {
    const sid = this.storeScope(c, storeId);
    const after = afterSeq && /^\d+$/.test(afterSeq) ? BigInt(afterSeq) : 0n;
    const rows = await this.prisma.integrationEvent.findMany({
      where: { tenantId: c.tenantId, ...(sid ? { storeId: sid } : {}), seq: { gt: after } },
      orderBy: { seq: 'asc' },
      take: MAX_PAGE,
    });
    return {
      items: rows.map((e) => ({ event_id: e.id, seq: e.seq.toString(), store_id: e.storeId, type: e.eventType, topic: `${e.storeId}/mgmt/${e.eventType}`, entity_id: e.entityId, payload: e.payload, timestamp: e.createdAt.toISOString() })),
      nextSeq: rows.length ? rows[rows.length - 1].seq.toString() : (afterSeq ?? '0'),
      hasMore: rows.length >= MAX_PAGE,
    };
  }

  // 写回呼叫记录：按 (来源系统, call_id) 幂等；已有时间字段不被空值覆盖
  async ingestCall(c: IntegrationCaller, dto: Record<string, any>) {
    const callId = String(dto.call_id ?? '').trim();
    const storeId = String(dto.store_id ?? c.storeId ?? '').trim();
    if (!callId || !storeId) throw new BadRequestException('call_id、store_id 必填');
    this.storeScope(c, storeId);
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: c.tenantId }, select: { id: true } });
    if (!store) throw new BadRequestException('store_id 不存在');
    const t = (v: unknown) => (v ? new Date(String(v)) : undefined);
    const data = {
      roomId: dto.room_id ? String(dto.room_id) : undefined,
      stayId: dto.stay_id ? String(dto.stay_id) : undefined,
      requestType: dto.request_type ? String(dto.request_type) : undefined,
      serviceCode: dto.service_code ? String(dto.service_code) : undefined,
      status: dto.status ? String(dto.status) : undefined,
      initiatedAt: t(dto.initiated_at),
      dispatchedAt: t(dto.dispatched_at),
      acceptedAt: t(dto.accepted_at),
      completedAt: t(dto.completed_at),
      handlerStaffId: dto.handler_staff_id ? String(dto.handler_staff_id) : undefined,
      feedback: dto.feedback ? String(dto.feedback) : undefined,
      payload: (dto.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    for (const k of ['initiatedAt', 'dispatchedAt', 'acceptedAt', 'completedAt'] as const) {
      if (data[k] && Number.isNaN(data[k]!.getTime())) throw new BadRequestException(`${k} 时间格式不对`);
    }
    // 校验引用的房间/入住都属于这家店（防止串店写入）
    if (data.roomId) {
      const r = await this.prisma.room.findFirst({ where: { id: data.roomId, tenantId: c.tenantId, storeId }, select: { id: true } });
      if (!r) throw new BadRequestException('room_id 不属于该门店');
    }
    if (data.stayId) {
      const o = await this.prisma.roomOccupancy.findFirst({ where: { id: data.stayId, tenantId: c.tenantId, storeId }, select: { id: true } });
      if (!o) throw new BadRequestException('stay_id 不属于该门店');
    }
    const row = await this.prisma.externalCallRecord.upsert({
      where: { tenantId_source_callId: { tenantId: c.tenantId, source: c.code, callId } },
      create: { tenantId: c.tenantId, storeId, source: c.code, callId, requestType: data.requestType ?? 'UNKNOWN', initiatedAt: data.initiatedAt ?? new Date(), status: data.status ?? 'CREATED', roomId: data.roomId, stayId: data.stayId, serviceCode: data.serviceCode, dispatchedAt: data.dispatchedAt, acceptedAt: data.acceptedAt, completedAt: data.completedAt, handlerStaffId: data.handlerStaffId, feedback: data.feedback, payload: data.payload },
      update: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    });
    return { id: row.id, call_id: row.callId, status: row.status };
  }

  // 统一账号校验：账号(用户名/手机号)+密码 → staff_id + 角色 + 权限
  async verifyAuth(c: IntegrationCaller, username: string, password: string) {
    const key = (username ?? '').trim();
    if (!key || !password) throw new BadRequestException('username、password 必填');
    let account = await this.prisma.account.findFirst({ where: { tenantId: c.tenantId, username: key } });
    if (!account) {
      const phone = normalizeMobile(key);
      if (phone) account = await this.prisma.account.findFirst({ where: { tenantId: c.tenantId, phone } });
    }
    const ok = account && account.status === 'ACTIVE' && (await this.passwordService.compare(password, account.passwordHash));
    if (!account || !ok) return { valid: false };
    if (c.storeId && account.storeId && account.storeId !== c.storeId) return { valid: false };
    const [permissions, assigns] = await Promise.all([
      this.permissionLookup.getPermissionCodes(account.id),
      this.prisma.accountRoleAssignment.findMany({ where: { accountId: account.id, revokedAt: null }, include: { role: { select: { code: true } } } }),
    ]);
    return {
      valid: true,
      staff_id: account.id,
      store_id: account.storeId,
      name: account.realName,
      roles: [...new Set(assigns.map((a) => a.role.code))],
      permissions: [...permissions].sort(),
    };
  }
}
