import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { QueryEmployeeProfileDto } from './dto/query-employee-profile.dto';

const includeProfile = { account: { select: { id: true, realName: true, username: true, storeId: true, departmentId: true, positionId: true } } };

/** 员工档案：Account 的 1:1 HR 扩展，身份信息（姓名/门店/部门/职位）仍以 Account 为准。 */
@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryEmployeeProfileDto = {}) {
    return this.prisma.employeeProfile.findMany({
      where: { tenantId: this.ctx.tenantId, status: query.status, account: query.storeId ? { storeId: query.storeId } : undefined },
      include: includeProfile,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { id }, include: includeProfile });
    if (!profile) throw new NotFoundException(`EmployeeProfile ${id} 不存在`);
    return profile;
  }

  /** 到期提醒：健康证/合同/转正三类日期字段，withinDays 内到期或已过期均返回。 */
  async expiryAlerts(withinDays = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);
    const now = new Date();

    const profiles = await this.prisma.employeeProfile.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        status: 'ACTIVE',
        OR: [
          { healthCertExpiresAt: { lte: threshold } },
          { contractExpiresAt: { lte: threshold } },
          { probationEndsAt: { lte: threshold } },
        ],
      },
      include: includeProfile,
    });

    return profiles.map((p) => ({
      ...p,
      alerts: [
        p.healthCertExpiresAt && p.healthCertExpiresAt <= threshold
          ? { type: 'HEALTH_CERT', expiresAt: p.healthCertExpiresAt, isExpired: p.healthCertExpiresAt < now }
          : null,
        p.contractExpiresAt && p.contractExpiresAt <= threshold
          ? { type: 'CONTRACT', expiresAt: p.contractExpiresAt, isExpired: p.contractExpiresAt < now }
          : null,
        p.probationEndsAt && p.probationEndsAt <= threshold
          ? { type: 'PROBATION', expiresAt: p.probationEndsAt, isExpired: p.probationEndsAt < now }
          : null,
      ].filter((a): a is { type: string; expiresAt: Date; isExpired: boolean } => a !== null),
    }));
  }

  async create(dto: CreateEmployeeProfileDto): Promise<EmployeeProfile> {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) throw new NotFoundException(`Account ${dto.accountId} 不存在`);
    const existing = await this.prisma.employeeProfile.findUnique({ where: { accountId: dto.accountId } });
    if (existing) throw new BadRequestException('该账号已建立员工档案');

    const created = await this.prisma.employeeProfile.create({
      data: {
        tenantId: this.ctx.tenantId!,
        accountId: dto.accountId,
        employeeNo: dto.employeeNo,
        hireDate: new Date(dto.hireDate),
        employmentType: dto.employmentType,
        healthCertExpiresAt: dto.healthCertExpiresAt ? new Date(dto.healthCertExpiresAt) : undefined,
        contractExpiresAt: dto.contractExpiresAt ? new Date(dto.contractExpiresAt) : undefined,
        probationEndsAt: dto.probationEndsAt ? new Date(dto.probationEndsAt) : undefined,
        remark: dto.remark,
        createdBy: this.ctx.accountId!,
      },
      include: includeProfile,
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'EmployeeProfile',
      entityId: created.id,
      afterData: created,
      tenantId: this.ctx.tenantId,
      storeId: account.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return created;
  }

  async update(id: string, dto: UpdateEmployeeProfileDto): Promise<EmployeeProfile> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    const { version: _version, ...data } = dto;
    const updated = await runVersionedUpdate(() =>
      this.prisma.employeeProfile.update({
        where: { id, version: dto.version },
        data: {
          ...data,
          healthCertExpiresAt: data.healthCertExpiresAt ? new Date(data.healthCertExpiresAt) : undefined,
          contractExpiresAt: data.contractExpiresAt ? new Date(data.contractExpiresAt) : undefined,
          probationEndsAt: data.probationEndsAt ? new Date(data.probationEndsAt) : undefined,
          terminationDate: data.terminationDate ? new Date(data.terminationDate) : undefined,
          version: { increment: 1 },
        },
        include: includeProfile,
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'EmployeeProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      tenantId: this.ctx.tenantId,
      storeId: before.account.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return updated;
  }
}
