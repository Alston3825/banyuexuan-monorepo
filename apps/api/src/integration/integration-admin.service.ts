import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/context/request-context.service';
import { hashApiKey } from './api-key.guard';

export const DEFAULT_SERVICE_CODES = [
  { serviceCode: 'NEED_NURSE', name: '呼叫护理师', category: 'CALL', sortNo: 1 },
  { serviceCode: 'BABY_CRY', name: '宝宝哭闹', category: 'CALL', sortNo: 2 },
  { serviceCode: 'MILK_STORAGE', name: '母乳存放', category: 'CALL', sortNo: 3 },
  { serviceCode: 'HOT_WATER', name: '送热水', category: 'CALL', sortNo: 4 },
  { serviceCode: 'CLEANING', name: '保洁', category: 'CALL', sortNo: 5 },
  { serviceCode: 'EMERGENCY', name: '紧急呼叫', category: 'CALL', sortNo: 6 },
  { serviceCode: 'CUSTOM', name: '其他需求', category: 'CALL', sortNo: 7 },
];

/** 后台管理：已接入系统、房间设备绑定、服务项字典（走登录 + 权限点） */
@Injectable()
export class IntegrationAdminService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContextService) {}

  private get tenantId(): string {
    const t = this.ctx.tenantId;
    if (!t) throw new UnauthorizedException('未登录');
    return t;
  }

  // ---------- 接入系统 ----------
  listSystems() {
    return this.prisma.integrationSystem.findMany({
      where: { tenantId: this.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, name: true, baseUrl: true, systemVersion: true, storeId: true, apiKeyPrefix: true, enabled: true, lastSeenAt: true, remark: true, createdAt: true, version: true },
    });
  }

  private newKey() {
    const key = `bmx_${crypto.randomBytes(24).toString('hex')}`;
    return { key, apiKeyHash: hashApiKey(key), apiKeyPrefix: key.slice(0, 10) };
  }

  async createSystem(dto: { code: string; name: string; baseUrl?: string; systemVersion?: string; storeId?: string; remark?: string }) {
    const code = dto.code.trim();
    if (!/^[a-z0-9][a-z0-9-_]{1,62}$/.test(code)) throw new BadRequestException('系统代号只能用小写字母、数字、-、_（如 call-locating）');
    const exists = await this.prisma.integrationSystem.findFirst({ where: { tenantId: this.tenantId, code } });
    if (exists) throw new ConflictException('该系统代号已存在');
    const { key, apiKeyHash, apiKeyPrefix } = this.newKey();
    const row = await this.prisma.integrationSystem.create({
      data: { tenantId: this.tenantId, code, name: dto.name.trim(), baseUrl: dto.baseUrl || null, systemVersion: dto.systemVersion || null, storeId: dto.storeId || null, remark: dto.remark || null, apiKeyHash, apiKeyPrefix, createdBy: this.ctx.accountId! },
    });
    return { id: row.id, code: row.code, apiKey: key }; // 明文只此一次
  }

  async updateSystem(id: string, dto: { name?: string; baseUrl?: string; systemVersion?: string; storeId?: string | null; enabled?: boolean; remark?: string }) {
    const row = await this.prisma.integrationSystem.findFirst({ where: { id, tenantId: this.tenantId } });
    if (!row) throw new NotFoundException('接入系统不存在');
    return this.prisma.integrationSystem.update({ where: { id }, data: { ...dto, version: { increment: 1 } } });
  }

  async resetKey(id: string) {
    const row = await this.prisma.integrationSystem.findFirst({ where: { id, tenantId: this.tenantId } });
    if (!row) throw new NotFoundException('接入系统不存在');
    const { key, apiKeyHash, apiKeyPrefix } = this.newKey();
    await this.prisma.integrationSystem.update({ where: { id }, data: { apiKeyHash, apiKeyPrefix, version: { increment: 1 } } });
    return { id, apiKey: key };
  }

  // ---------- 房间设备绑定 ----------
  listBindings(storeId?: string, roomId?: string) {
    return this.prisma.roomDeviceBinding.findMany({
      where: { tenantId: this.tenantId, ...(storeId ? { storeId } : {}), ...(roomId ? { roomId } : {}) },
      include: { room: { select: { roomNo: true, floor: true } } },
      orderBy: [{ roomId: 'asc' }, { kind: 'asc' }, { deviceCode: 'asc' }],
    });
  }

  async addBinding(dto: { roomId: string; kind: 'TABLET' | 'BEACON'; deviceCode: string; remark?: string }) {
    const room = await this.prisma.room.findFirst({ where: { id: dto.roomId, tenantId: this.tenantId } });
    if (!room) throw new NotFoundException('房间不存在');
    const deviceCode = dto.deviceCode.trim();
    if (!deviceCode) throw new BadRequestException('设备编号不能为空');
    // 信标编号必须与手表上报的格式一致：大号-小号，如 1601-1，否则定位对不上
    if (dto.kind === 'BEACON' && !/^\d+-\d+$/.test(deviceCode)) {
      throw new BadRequestException('信标编号格式必须是「大号-小号」，例如 1601-1（只含数字和中间一个短横线）');
    }
    const dup = await this.prisma.roomDeviceBinding.findFirst({ where: { tenantId: this.tenantId, storeId: room.storeId, kind: dto.kind, deviceCode }, include: { room: true } });
    if (dup) throw new ConflictException(`该设备编号已绑定在 ${dup.room.roomNo} 房`);
    if (dto.kind === 'TABLET') {
      const has = await this.prisma.roomDeviceBinding.findFirst({ where: { tenantId: this.tenantId, roomId: room.id, kind: 'TABLET' } });
      if (has) throw new ConflictException('这间房已绑定了一台平板，请先解绑再换');
    }
    return this.prisma.roomDeviceBinding.create({ data: { tenantId: this.tenantId, storeId: room.storeId, roomId: room.id, kind: dto.kind, deviceCode, remark: dto.remark || null, createdBy: this.ctx.accountId! } });
  }

  async removeBinding(id: string) {
    const row = await this.prisma.roomDeviceBinding.findFirst({ where: { id, tenantId: this.tenantId } });
    if (!row) throw new NotFoundException('绑定不存在');
    // 解绑后外部系统靠 room 的 updatedAt 感知变化：碰一下房间
    await this.prisma.$transaction([
      this.prisma.roomDeviceBinding.delete({ where: { id } }),
      this.prisma.room.update({ where: { id: row.roomId }, data: { updatedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  // ---------- 服务项字典 ----------
  async listServiceCodes() {
    const tenantId = this.tenantId;
    await ensureServiceCodes(this.prisma, tenantId);
    return this.prisma.serviceCatalogItem.findMany({ where: { tenantId }, orderBy: { sortNo: 'asc' } });
  }

  async upsertServiceCode(dto: { serviceCode: string; name: string; category?: string; sortNo?: number; status?: 'ACTIVE' | 'INACTIVE' }) {
    const serviceCode = dto.serviceCode.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(serviceCode)) throw new BadRequestException('服务代号只能用大写字母、数字、下划线');
    return this.prisma.serviceCatalogItem.upsert({
      where: { tenantId_serviceCode: { tenantId: this.tenantId, serviceCode } },
      create: { tenantId: this.tenantId, serviceCode, name: dto.name, category: dto.category ?? 'CALL', sortNo: dto.sortNo ?? 99, status: dto.status ?? 'ACTIVE' },
      update: { name: dto.name, ...(dto.category ? { category: dto.category } : {}), ...(dto.sortNo != null ? { sortNo: dto.sortNo } : {}), ...(dto.status ? { status: dto.status } : {}) },
    });
  }

  // ---------- 呼叫记录（后台查看） ----------
  listCalls(q: { storeId?: string; roomId?: string; stayId?: string; from?: string; to?: string; take?: number }) {
    return this.prisma.externalCallRecord.findMany({
      where: {
        tenantId: this.tenantId,
        ...(q.storeId ? { storeId: q.storeId } : {}),
        ...(q.roomId ? { roomId: q.roomId } : {}),
        ...(q.stayId ? { stayId: q.stayId } : {}),
        ...(q.from || q.to ? { initiatedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: { initiatedAt: 'desc' },
      take: Math.min(q.take ?? 100, 500),
    });
  }
}

/** 租户首次用到时补齐默认服务项（不覆盖已有、不复活用户停用的） */
export async function ensureServiceCodes(prisma: PrismaService, tenantId: string) {
  const n = await prisma.serviceCatalogItem.count({ where: { tenantId } });
  if (n > 0) return;
  await prisma.serviceCatalogItem.createMany({ data: DEFAULT_SERVICE_CODES.map((d) => ({ ...d, tenantId })), skipDuplicates: true });
}
