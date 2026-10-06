import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer, Prisma, ReferrerType } from '@prisma/client';
import { pinyin } from 'pinyin-pro';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { checkIdCard } from '../../common/utils/id-card.util';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

/**
 * 客户主数据：租户全局共享，不做门店级数据隔离（已与业务方确认）——
 * 只按 tenantId 过滤，不调用 DataScopeService 做门店范围收窄，任何持有
 * crm.customer.view 权限点的账号都能看到全部客户。
 */
@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCustomerDto): Promise<Customer[]> {
    const where: Prisma.CustomerWhereInput = {
      tenantId: this.ctx.tenantId,
      assignedToId: query.assignedToId,
      primaryStoreId: query.primaryStoreId,
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword } },
              { phone: { contains: query.keyword } },
              { customerNo: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    return this.prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} 不存在`);
    return customer;
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const { allowDuplicatePhone, expectedDueDate, birthday, registeredAt, ccAccountIds, idCardNo, channelTypeId, source, ...rest } = dto;
    await this.assertPhoneAvailable(dto.phone, allowDuplicatePhone);
    const idInfo = this.normalizeIdCard(idCardNo);
    const type = await this.resolveChannelType(channelTypeId, source, true);
    await this.assertChannel(dto.channelId, type.id);
    await this.assertReferrer(dto.referrerType, dto.referrerId);
    await this.assertAccounts([dto.assignedToId, dto.phoneSalesId, ...(ccAccountIds ?? [])]);

    const created = await this.prisma.customer.create({
      data: {
        ...rest,
        source: type.source,
        channelTypeId: type.id,
        idCardNo: idInfo?.normalized,
        expectedDueDate: expectedDueDate ? new Date(expectedDueDate) : undefined,
        birthday: birthday ? new Date(birthday) : idInfo?.birthday ? new Date(idInfo.birthday) : undefined,
        registeredAt: registeredAt ? new Date(registeredAt) : undefined,
        ccAccountIds: ccAccountIds && ccAccountIds.length > 0 ? ccAccountIds : undefined,
        assignedToId: dto.assignedToId ?? this.ctx.accountId,
        customerNo: generateBusinessNo('C'),
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Customer',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  /** 传 null 表示清空该项，不传表示不修改（见 UpdateCustomerDto）。 */
  async update(id: string, dto: Omit<UpdateCustomerDto, 'version'>, expectedVersion: number): Promise<Customer> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const { allowDuplicatePhone, expectedDueDate, birthday, registeredAt, ccAccountIds, idCardNo, channelTypeId, source, ...rest } = dto;

    if (dto.phone !== undefined && dto.phone !== before.phone) await this.assertPhoneAvailable(dto.phone, allowDuplicatePhone, id);
    const data: Prisma.CustomerUncheckedUpdateInput = { ...rest };

    if (idCardNo !== undefined) {
      const idInfo = this.normalizeIdCard(idCardNo);
      data.idCardNo = idInfo ? idInfo.normalized : null;
      // 改了身份证、又没有单独指定生日时，生日跟着身份证重算
      if (birthday === undefined && idInfo?.birthday) data.birthday = new Date(idInfo.birthday);
    }
    if (birthday !== undefined) data.birthday = birthday ? new Date(birthday) : null;
    if (expectedDueDate !== undefined) data.expectedDueDate = expectedDueDate ? new Date(expectedDueDate) : null;
    if (registeredAt) data.registeredAt = new Date(registeredAt);
    if (ccAccountIds !== undefined) data.ccAccountIds = ccAccountIds && ccAccountIds.length > 0 ? ccAccountIds : Prisma.DbNull;

    // 渠道类型和具体渠道必须配套：只改了类型、旧的具体渠道不属于新类型，就自动清空具体渠道
    let nextTypeId = before.channelTypeId;
    if (channelTypeId !== undefined || source !== undefined) {
      const type = await this.resolveChannelType(channelTypeId, source, true, before.channelTypeId);
      if (type.id !== before.channelTypeId) {
        data.channelTypeId = type.id;
        data.source = type.source;
      }
      nextTypeId = type.id;
    }
    const nextChannelId = dto.channelId !== undefined ? dto.channelId : before.channelId;
    if (nextChannelId && (dto.channelId !== undefined || nextTypeId !== before.channelTypeId)) {
      const ok = await this.prisma.customerChannel.findFirst({ where: { id: nextChannelId, tenantId: this.ctx.tenantId, typeId: nextTypeId ?? undefined } });
      if (ok) {
        data.channelId = nextChannelId;
      } else if (dto.channelId) {
        throw new BadRequestException('所选具体渠道不属于该渠道类型');
      } else {
        data.channelId = null;
      }
    }
    if (dto.referrerType !== undefined || dto.referrerId !== undefined) {
      const type = dto.referrerType !== undefined ? dto.referrerType : before.referrerType;
      const refId = dto.referrerId !== undefined ? dto.referrerId : before.referrerId;
      if (type === 'CUSTOMER' && refId === id) throw new BadRequestException('推荐人不能是客户自己');
      await this.assertReferrer(type ?? undefined, refId ?? undefined);
    }
    await this.assertAccounts([dto.assignedToId, dto.phoneSalesId, ...(ccAccountIds ?? [])]);

    const updated = await runVersionedUpdate(() =>
      this.prisma.customer.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Customer',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(dto),
      ...this.auditCtx(),
    });
    return updated;
  }

  // ---------------- 校验 ----------------

  /** 手机号查重。"待补充"这类占位值不参与；再次入住的妈妈（二胎等）勾选 allow 后放行。 */
  private async assertPhoneAvailable(phone: string, allow: boolean | undefined, excludeId?: string): Promise<void> {
    if (allow) return;
    const dup = await this.prisma.customer.findFirst({
      where: { tenantId: this.ctx.tenantId, phone, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { name: true, customerNo: true },
    });
    if (dup) {
      throw new ConflictException(
        `手机号 ${phone} 已被客户「${dup.name}」（${dup.customerNo}）使用，请直接使用该客户档案；如果确实是另一位客户（例如再次入住的妈妈），请在“新添客户”页勾选“再次入住妈妈，允许号码重复”后建档`,
      );
    }
  }

  /** 空值返回 null；有值就必须是合法的 18 位身份证。 */
  private normalizeIdCard(raw: string | null | undefined): { normalized: string; birthday: string | null } | null {
    if (!raw || !raw.trim()) return null;
    const check = checkIdCard(raw);
    if (!check.valid) throw new BadRequestException(check.reason ?? '身份证号不正确');
    return { normalized: check.normalized, birthday: check.birthday };
  }

  /**
   * 渠道类型：页面传 channelTypeId；内部调用（线索转化、合同自动建客户）传旧枚举 source，换算成对应的内置类型。
   * source 字段记的是"旧版 6 类归并值"：内置类型就是它自己，自定义类型一律记 OTHER。
   */
  private async resolveChannelType(
    channelTypeId: string | undefined,
    source: Customer['source'] | undefined,
    mustBeActive: boolean,
    currentTypeId?: string | null,
  ): Promise<{ id: string; source: Customer['source'] }> {
    if (!channelTypeId && !source) throw new BadRequestException('请选择渠道类型');
    const type = channelTypeId
      ? await this.prisma.customerChannelType.findFirst({ where: { id: channelTypeId, tenantId: this.ctx.tenantId } })
      : await this.prisma.customerChannelType.findFirst({ where: { tenantId: this.ctx.tenantId, legacySource: source } });
    if (!type) throw new BadRequestException('所选渠道类型不存在');
    // 停用的类型：新建时不能选；编辑时沿用客户原来的类型（已停用也行）不拦，换成别的停用类型才拦
    if (mustBeActive && type.status !== 'ACTIVE' && type.id !== currentTypeId) throw new BadRequestException(`渠道类型「${type.name}」已停用`);
    return { id: type.id, source: type.legacySource ?? 'OTHER' };
  }

  private async assertChannel(channelId: string | undefined, typeId: string): Promise<void> {
    if (!channelId) return;
    const channel = await this.prisma.customerChannel.findFirst({ where: { id: channelId, tenantId: this.ctx.tenantId } });
    if (!channel) throw new BadRequestException('所选具体渠道不存在');
    if (channel.typeId !== typeId) throw new BadRequestException('所选具体渠道不属于该渠道类型');
    if (channel.status !== 'ACTIVE') throw new BadRequestException('所选具体渠道已停用');
  }

  private async assertReferrer(type: ReferrerType | undefined, refId: string | undefined): Promise<void> {
    if (!type && !refId) return;
    if (!type || !refId) throw new BadRequestException('推荐人类型和推荐人要同时填写');
    const exists =
      type === 'CUSTOMER'
        ? await this.prisma.customer.count({ where: { id: refId, tenantId: this.ctx.tenantId } })
        : await this.prisma.account.count({ where: { id: refId, tenantId: this.ctx.tenantId } });
    if (!exists) throw new BadRequestException('所选推荐人不存在');
  }

  private async assertAccounts(ids: (string | null | undefined)[]): Promise<void> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return;
    const count = await this.prisma.account.count({ where: { id: { in: unique }, tenantId: this.ctx.tenantId } });
    if (count !== unique.length) throw new BadRequestException('包含不存在的员工账号');
  }

  // ---------------- 新建客户页面用的选择器数据 ----------------

  /** 拼音简拼，如 "李青" -> "lq"；搜索框里输入简拼也能找到人。 */
  private initials(name: string): string {
    return pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
  }

  /** 员工下拉（电话销售员/门店销售员/抄送人/推荐人）。不依赖 platform.account 权限，店员也能选。 */
  async staffOptions(keyword?: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'ACTIVE' },
      select: { id: true, realName: true, username: true },
      orderBy: { realName: 'asc' },
      take: 500,
    });
    const k = keyword?.trim().toLowerCase();
    if (!k) return accounts;
    return accounts.filter((a) => a.realName.includes(keyword!.trim()) || a.username.toLowerCase().includes(k) || this.initials(a.realName).includes(k));
  }

  /** 推荐人搜索：老客户 + 员工一起搜，支持姓名、手机号、拼音简拼。 */
  async searchReferrers(keyword: string) {
    const k = keyword.trim();
    if (!k) return { customers: [], accounts: [] };
    const lower = k.toLowerCase();
    const alphabetic = /^[a-z]+$/.test(lower);
    const customers = alphabetic
      ? (
          await this.prisma.customer.findMany({
            where: { tenantId: this.ctx.tenantId },
            select: { id: true, name: true, phone: true, customerNo: true },
          })
        )
          .filter((c) => this.initials(c.name).includes(lower))
          .slice(0, 10)
      : await this.prisma.customer.findMany({
          where: { tenantId: this.ctx.tenantId, OR: [{ name: { contains: k } }, { phone: { contains: k } }, { customerNo: { contains: k } }] },
          select: { id: true, name: true, phone: true, customerNo: true },
          take: 10,
        });
    const accounts = (await this.staffOptions(k)).slice(0, 10);
    return { customers, accounts };
  }

  /** 新建客户页"身份证号码验证"按钮：校验并返回出生日期。 */
  checkIdCard(idCardNo: string) {
    return checkIdCard(idCardNo);
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
