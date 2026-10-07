import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { AuditLogService } from '../../audit/audit-log.service';

export class WorkflowNodeInput {
  @IsString() @MaxLength(30) name: string;
  @IsIn(['ROLE', 'ACCOUNT']) approverType: 'ROLE' | 'ACCOUNT';
  @IsOptional() @IsString() approverRoleId?: string;
  @IsOptional() @IsString() approverAccountId?: string;
  @IsIn(['ALL', 'ANY']) approvalMode: 'ALL' | 'ANY';
  /** 处理时限（小时），不填=不限时 */
  @IsOptional() @IsInt() @Min(1) @Max(720) timeoutHours?: number | null;
}

export class SaveWorkflowDefinitionDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  /** false = 停用（停用后这类单据提交审批会提示联系管理员） */
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** 传了就是“改流程”：保存成新版本；已经在审批中的单据继续按旧流程走完 */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowNodeInput) nodes?: WorkflowNodeInput[];
}

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly auditLogService: AuditLogService,
  ) {}

  findMany() {
    return this.prisma.workflowDefinition.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'PUBLISHED' },
      include: { nodes: { orderBy: { seq: 'asc' } } },
    });
  }

  /** 设置页：每类单据取最新一版（含已停用的），附带审批人姓名/角色名和“正在审批中的单据数”。 */
  async listForSettings() {
    const all = await this.prisma.workflowDefinition.findMany({
      where: { tenantId: this.ctx.tenantId },
      include: { nodes: { orderBy: { seq: 'asc' } } },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });
    const latest = new Map<string, (typeof all)[number]>();
    for (const d of all) if (!latest.has(d.code)) latest.set(d.code, d);
    const defs = [...latest.values()];
    const roleIds = defs.flatMap((d) => d.nodes.map((n) => n.approverRoleId)).filter((x): x is string => !!x);
    const accIds = defs.flatMap((d) => d.nodes.map((n) => n.approverAccountId)).filter((x): x is string => !!x);
    const [roles, accounts, inflight] = await Promise.all([
      this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }),
      this.prisma.account.findMany({ where: { id: { in: accIds } }, select: { id: true, realName: true } }),
      this.prisma.workflowInstance.groupBy({ by: ['workflowDefinitionId'], where: { tenantId: this.ctx.tenantId, status: 'IN_REVIEW' }, _count: { _all: true } }),
    ]);
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const accName = new Map(accounts.map((a) => [a.id, a.realName]));
    const inflightByDef = new Map(inflight.map((g) => [g.workflowDefinitionId, g._count._all]));
    // 同一类单据所有版本里正在审批的单据数
    const versionsOf = (code: string) => all.filter((d) => d.code === code).map((d) => d.id);
    return defs.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      version: d.version,
      enabled: d.status === 'PUBLISHED',
      updatedAt: d.updatedAt,
      inReview: versionsOf(d.code).reduce((n, id) => n + (inflightByDef.get(id) ?? 0), 0),
      nodes: d.nodes.map((n) => ({
        seq: n.seq,
        name: n.name,
        approverType: n.approverType,
        approverRoleId: n.approverRoleId,
        approverAccountId: n.approverAccountId,
        approverLabel: n.approverType === 'ROLE' ? roleName.get(n.approverRoleId ?? '') ?? '（角色已删除）' : accName.get(n.approverAccountId ?? '') ?? '（员工已删除）',
        approvalMode: n.approvalMode,
        timeoutHours: n.timeoutHours,
      })),
    }));
  }

  /** 修改某类单据的审批流程：改节点 = 生成新版本；只改名称/启停 = 原地更新。 */
  async save(code: string, dto: SaveWorkflowDefinitionDto) {
    const tenantId = this.ctx.tenantId!;
    const latest = await this.prisma.workflowDefinition.findFirst({ where: { tenantId, code }, orderBy: { version: 'desc' }, include: { nodes: { orderBy: { seq: 'asc' } } } });
    if (!latest) throw new NotFoundException('没有这类审批流程');
    const name = dto.name?.trim() || latest.name;

    if (!dto.nodes) {
      await this.prisma.workflowDefinition.update({ where: { id: latest.id }, data: { name, status: dto.enabled === undefined ? latest.status : dto.enabled ? 'PUBLISHED' : 'DISABLED' } });
      await this.audit(latest.id, `${dto.enabled === false ? '停用' : dto.enabled ? '启用' : '修改名称'}审批流程「${name}」`);
      return this.one(code);
    }

    const nodes = dto.nodes;
    if (nodes.length < 1 || nodes.length > 8) throw new BadRequestException('审批流程至少要有 1 个节点，最多 8 个');
    for (const [i, n] of nodes.entries()) {
      if (!n.name?.trim()) throw new BadRequestException(`第 ${i + 1} 个节点请填写名称`);
      if (n.approverType === 'ROLE') {
        if (!n.approverRoleId || !(await this.prisma.role.findFirst({ where: { id: n.approverRoleId, tenantId }, select: { id: true } }))) throw new BadRequestException(`第 ${i + 1} 个节点（${n.name}）请选择审批角色`);
      } else if (!n.approverAccountId || !(await this.prisma.account.findFirst({ where: { id: n.approverAccountId, tenantId, status: 'ACTIVE' }, select: { id: true } }))) {
        throw new BadRequestException(`第 ${i + 1} 个节点（${n.name}）请选择一位在职员工作为审批人`);
      }
    }
    const enabled = dto.enabled ?? latest.status === 'PUBLISHED';
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.workflowDefinition.updateMany({ where: { tenantId, code }, data: { status: 'DISABLED' } }); // 旧版本退役（进行中的单据仍按旧版走完）
      return tx.workflowDefinition.create({
        data: {
          tenantId,
          code,
          name,
          version: latest.version + 1,
          status: enabled ? 'PUBLISHED' : 'DISABLED',
          createdBy: this.ctx.accountId!,
          nodes: {
            create: nodes.map((n, i) => ({
              seq: i + 1,
              name: n.name.trim(),
              approverType: n.approverType,
              approverRoleId: n.approverType === 'ROLE' ? n.approverRoleId : null,
              approverAccountId: n.approverType === 'ACCOUNT' ? n.approverAccountId : null,
              approvalMode: n.approvalMode,
              timeoutHours: n.timeoutHours ?? null,
            })),
          },
        },
      });
    });
    await this.audit(created.id, `修改审批流程「${name}」：共 ${nodes.length} 个节点，新版本 v${created.version}`);
    return this.one(code);
  }

  private async one(code: string) {
    return (await this.listForSettings()).find((d) => d.code === code);
  }

  private audit(entityId: string, remark: string) {
    return this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'WorkflowDefinition',
      entityId,
      remark,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
  }
}
