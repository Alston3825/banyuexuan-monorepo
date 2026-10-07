import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeContractType, Prisma, SocialInsuranceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { checkIdCard } from '../../common/utils/id-card.util';
import { nextEmployeeNo, normalizeMobile } from '../../common/utils/employee-no.util';
import { CellValue, readXlsx } from '../../common/utils/xlsx-reader';
import { AccountService } from './account.service';

export const DEFAULT_PASSWORD = 'banyuexuan';

export interface ImportRow {
  rowNo: number;
  employeeNo: string | null;
  name: string;
  phone: string | null;
  storeName: string | null;
  teamName: string | null;
  departmentName: string | null;
  positionName: string | null;
  hireDate: string | null; // YYYY-MM-DD
  contractType: string | null;
  socialInsurance: string | null;
  idCardNo: string | null;
  bankAccountNo: string | null;
  bankName: string | null;
  remark: string | null;
}

export interface ImportIssue {
  level: 'error' | 'warn';
  text: string;
}

export interface ImportPreviewRow extends ImportRow {
  storeId: string | null;
  /** 没写工号的行，系统按顺序预分配的工号（可在预览里改） */
  employeeNoSuggested: boolean;
  /** 部门/职位在系统里还没有，导入时会自动新建 */
  newDepartment: boolean;
  newPosition: boolean;
  /** 备注里写了“离职”：默认不勾选 */
  resigned: boolean;
  issues: ImportIssue[];
}

export interface ImportPreview {
  sheetName: string;
  headerRow: number;
  /** 表里有、但开通账号用不上也没有对应字段的列 */
  ignoredColumns: string[];
  rows: ImportPreviewRow[];
}

const ALIASES: Record<keyof Omit<ImportRow, 'rowNo'> | 'username', string[]> = {
  employeeNo: ['员工工号', '工号', '员工编号', '编号'],
  storeName: ['门店', '所属门店'],
  teamName: ['班组', '组别'],
  username: ['用户名', '账号', '登录名'],
  name: ['姓名', '员工姓名'],
  departmentName: ['部门'],
  positionName: ['职位', '职务', '岗位'],
  hireDate: ['入职日期', '入职时间'],
  phone: ['手机号', '手机号码', '联系电话', '手机', '电话'],
  contractType: ['合同类型'],
  socialInsurance: ['社保缴纳', '社保'],
  idCardNo: ['身份证号码', '身份证号', '身份证'],
  bankAccountNo: ['工资卡账号', '工资卡', '银行卡号', '银行卡'],
  bankName: ['开户行', '开户银行'],
  remark: ['备注'],
};

const CONTRACT: Record<string, EmployeeContractType> = { 劳动合同: 'LABOR', 试用期合同: 'PROBATION', 劳务合同: 'SERVICE', 待签: 'PENDING_SIGN', '用工协议（超龄）': 'OVERAGE', '用工协议(超龄)': 'OVERAGE', 用工协议: 'OVERAGE' };

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const text = (v: CellValue): string | null => {
  if (v === null || v === undefined) return null;
  const t = clean(v);
  return t || null;
};

/** Excel 日期：序列号（1900 日期系统）或 “2026.8.19 / 2026-08-19 / 2026年8月19日” 这类文字 */
export function parseSheetDate(v: CellValue): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const m = /(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})/.exec(String(v));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d.toISOString().slice(0, 10) : null;
}

/** 工号单元格：数字格式的 1 补成 001（按同一列里其它工号的位数），文字格式原样保留 */
function cellEmployeeNo(v: CellValue, width: number): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return String(Math.round(v)).padStart(width, '0');
  return clean(v) || null;
}

/**
 * 员工信息表 → 批量开通账号。表里需要的列：姓名、手机号（必填）；工号、门店、部门、职位、入职日期、班组（有就读）；
 * 合同类型、社保、身份证、工资卡、开户行、备注（可选，勾选“同时导入员工档案信息”才写进员工档案）；其余列（如工龄）忽略。
 * 手机号 = 登录用户名，初始密码统一 banyuexuan。工号、手机号都不能重复。
 */
@Injectable()
export class AccountImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
    private readonly auditLogService: AuditLogService,
    private readonly dataScope: DataScopeService,
    private readonly ctx: RequestContextService,
  ) {}

  private get tenantId() {
    return this.ctx.tenantId!;
  }

  async preview(file: Buffer): Promise<ImportPreview> {
    let sheets;
    try {
      sheets = readXlsx(file);
    } catch (e) {
      throw new BadRequestException(`读取不了这个文件：${(e as Error).message}。请上传 Excel（.xlsx）文件`);
    }
    for (const sheet of sheets) {
      const headerIdx = sheet.rows.slice(0, 20).findIndex((r) => r.some((c) => ALIASES.name.includes(clean(c))) && r.some((c) => ALIASES.phone.includes(clean(c))));
      if (headerIdx < 0) continue;
      const header = sheet.rows[headerIdx].map((c) => clean(c));
      const col = (k: keyof typeof ALIASES) => header.findIndex((h) => h && ALIASES[k].includes(h));
      const idx = Object.fromEntries((Object.keys(ALIASES) as (keyof typeof ALIASES)[]).map((k) => [k, col(k)])) as Record<keyof typeof ALIASES, number>;
      const used = new Set(Object.values(idx).filter((i) => i >= 0));
      const ignoredColumns = header.filter((h, i) => h && !used.has(i));

      // 同一列工号的位数（数字格式的 1 → 001）
      const noCells = idx.employeeNo >= 0 ? sheet.rows.slice(headerIdx + 1).map((r) => r?.[idx.employeeNo]).filter((v) => typeof v === 'string') : [];
      const width = Math.max(3, ...noCells.map((v) => String(v).length));

      const parsed: ImportRow[] = [];
      for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r] ?? [];
        const get = (k: keyof typeof ALIASES) => (idx[k] >= 0 ? row[idx[k]] : null);
        const name = text(get('name'));
        const phoneRaw = text(get('phone'));
        if (!name && !phoneRaw) continue; // 空行
        parsed.push({
          rowNo: r + 1,
          employeeNo: cellEmployeeNo(get('employeeNo'), width),
          name: name ?? '',
          phone: phoneRaw ? (normalizeMobile(phoneRaw) ?? phoneRaw) : null,
          storeName: text(get('storeName')),
          teamName: text(get('teamName')),
          departmentName: text(get('departmentName')),
          positionName: text(get('positionName')),
          hireDate: parseSheetDate(get('hireDate')),
          contractType: text(get('contractType')),
          socialInsurance: text(get('socialInsurance')),
          idCardNo: text(get('idCardNo')),
          bankAccountNo: text(get('bankAccountNo'))?.replace(/\s/g, '') ?? null,
          bankName: text(get('bankName')),
          remark: text(get('remark')),
        });
      }
      return { sheetName: sheet.name, headerRow: headerIdx + 1, ignoredColumns, rows: await this.check(parsed) };
    }
    throw new BadRequestException('没有在表里找到“姓名”和“手机号”这两列，请确认表头里有这两列');
  }

  /** 逐行检查：问题分“错误”（这一行不能开通）和“提醒”（可以开通，但请留意） */
  async check(rows: ImportRow[]): Promise<ImportPreviewRow[]> {
    const [stores, departments, positions, accounts, profiles] = await Promise.all([
      this.prisma.store.findMany({ where: { tenantId: this.tenantId }, select: { id: true, name: true } }),
      this.prisma.department.findMany({ where: { tenantId: this.tenantId }, select: { name: true, storeId: true } }),
      this.prisma.position.findMany({ where: { tenantId: this.tenantId }, select: { name: true } }),
      this.prisma.account.findMany({ where: { tenantId: this.tenantId, phone: { not: null } }, select: { phone: true, realName: true } }),
      this.prisma.employeeProfile.findMany({ where: { tenantId: this.tenantId, activeEmployeeNo: { not: null } }, select: { activeEmployeeNo: true, account: { select: { realName: true } } } }),
    ]);
    const phoneOwner = new Map(accounts.map((a) => [a.phone as string, a.realName]));
    const noOwner = new Map(profiles.map((p) => [p.activeEmployeeNo as string, p.account.realName]));
    const sheetNos = new Set(rows.map((r) => r.employeeNo).filter((x): x is string => !!x));
    const assigned = new Set<string>();
    const seenPhone = new Map<string, number>();
    const seenNo = new Map<string, number>();

    const out: ImportPreviewRow[] = [];
    for (const r of rows) {
      const issues: ImportIssue[] = [];
      const err = (t: string) => issues.push({ level: 'error', text: t });
      const warn = (t: string) => issues.push({ level: 'warn', text: t });

      if (!r.name) err('缺姓名');
      // 手机号 = 登录名 + 员工的主要识别方式
      const phone = r.phone ? normalizeMobile(r.phone) : null;
      if (!r.phone) err('缺手机号（手机号是登录名，必须填）');
      else if (!phone) err(`手机号“${r.phone}”不是 11 位手机号`);
      else {
        if (phoneOwner.has(phone)) err(`手机号已经是「${phoneOwner.get(phone)}」的账号`);
        if (seenPhone.has(phone)) err(`和表里第 ${seenPhone.get(phone)} 行手机号重复`);
        else seenPhone.set(phone, r.rowNo);
      }

      // 工号：表里有就用（不能重复）；没有就按顺序预分配
      let employeeNo = r.employeeNo;
      let suggested = false;
      if (employeeNo) {
        if (noOwner.has(employeeNo)) err(`工号 ${employeeNo} 已经分配给「${noOwner.get(employeeNo)}」`);
        if (seenNo.has(employeeNo)) err(`和表里第 ${seenNo.get(employeeNo)} 行工号重复`);
        else seenNo.set(employeeNo, r.rowNo);
      } else {
        employeeNo = await nextEmployeeNo(this.prisma, this.tenantId, [...sheetNos, ...assigned]);
        assigned.add(employeeNo);
        suggested = true;
      }

      const store = r.storeName ? (stores.find((s) => s.name === r.storeName) ?? stores.find((s) => s.name.includes(r.storeName!) || r.storeName!.includes(s.name))) : null;
      if (r.storeName && !store) warn(`找不到门店“${r.storeName}”，将使用你在上面选的门店`);
      const dept = r.departmentName ? departments.some((d) => d.name === r.departmentName && (!store || d.storeId === store.id || !d.storeId)) : true;
      const pos = r.positionName ? positions.some((p) => p.name === r.positionName) : true;
      if (!r.hireDate) warn('没有写入职日期，将按今天算');
      if (r.idCardNo) {
        const c = checkIdCard(r.idCardNo);
        if (!c.valid) warn(`身份证号不正确（${c.reason}），员工档案里不会写入这一项`);
      }
      const resigned = /离职/.test(r.remark ?? '');
      if (resigned) warn('备注里写了“离职”，默认不开通账号（需要的话手动勾选）');

      out.push({ ...r, phone: phone ?? r.phone, employeeNo, storeId: store?.id ?? null, employeeNoSuggested: suggested, newDepartment: !dept, newPosition: !pos, resigned, issues });
    }
    return out;
  }

  async commit(input: { rows: ImportRow[]; storeId: string; createMissing: boolean; roleId?: string; importProfileDetails: boolean }) {
    const store = await this.prisma.store.findFirst({ where: { id: input.storeId, tenantId: this.tenantId } });
    if (!store) throw new BadRequestException('请选择要开通到哪个门店');
    await this.dataScope.assertStoreAccessible(this.ctx, store.id);
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new BadRequestException('没有要开通的员工');
    if (input.rows.length > 300) throw new BadRequestException('一次最多开通 300 人');
    if (input.roleId && !(await this.prisma.role.findFirst({ where: { id: input.roleId, tenantId: this.tenantId }, select: { id: true } }))) throw new BadRequestException('所选角色不存在');

    const checked = await this.check(input.rows);
    const results: { rowNo: number; name: string; ok: boolean; employeeNo?: string; error?: string }[] = [];
    const deptCache = new Map<string, string>();
    const posCache = new Map<string, string>();

    const dept = async (name: string | null, storeId: string) => {
      if (!name) return undefined;
      const key = `${storeId}|${name}`;
      if (deptCache.has(key)) return deptCache.get(key);
      const found = await this.prisma.department.findFirst({ where: { tenantId: this.tenantId, name, OR: [{ storeId }, { storeId: null }] } });
      let id = found?.id;
      if (!id && input.createMissing) {
        id = (await this.prisma.department.create({ data: { tenantId: this.tenantId, storeId, code: generateBusinessNo('DP'), name, createdBy: this.ctx.accountId! } })).id;
      }
      if (id) deptCache.set(key, id);
      return id;
    };
    const position = async (name: string | null) => {
      if (!name) return undefined;
      if (posCache.has(name)) return posCache.get(name);
      const found = await this.prisma.position.findFirst({ where: { tenantId: this.tenantId, name } });
      let id = found?.id;
      if (!id && input.createMissing) id = (await this.prisma.position.create({ data: { tenantId: this.tenantId, code: generateBusinessNo('PS'), name, createdBy: this.ctx.accountId! } })).id;
      if (id) posCache.set(name, id);
      return id;
    };

    for (const r of checked) {
      const errors = r.issues.filter((i) => i.level === 'error');
      if (errors.length > 0) {
        results.push({ rowNo: r.rowNo, name: r.name, ok: false, error: errors.map((e) => e.text).join('；') });
        continue;
      }
      try {
        const storeId = r.storeId ?? store.id;
        await this.dataScope.assertStoreAccessible(this.ctx, storeId);
        const team = r.teamName ? await this.prisma.team.findFirst({ where: { tenantId: this.tenantId, name: r.teamName } }) : null;
        const account = await this.accountService.create({
          username: r.phone!,
          realName: r.name,
          password: DEFAULT_PASSWORD,
          phone: r.phone!,
          storeId,
          departmentId: await dept(r.departmentName, storeId),
          teamId: team?.id,
          positionId: await position(r.positionName),
          employeeNo: r.employeeNo!,
          hireDate: new Date(`${r.hireDate ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`).toISOString(),
        });
        if (input.importProfileDetails) await this.writeProfileDetails(account.id, r);
        if (input.roleId) await this.accountService.assignRole(account.id, input.roleId, 'STORE', storeId);
        results.push({ rowNo: r.rowNo, name: r.name, ok: true, employeeNo: r.employeeNo! });
      } catch (e) {
        results.push({ rowNo: r.rowNo, name: r.name, ok: false, error: (e as { response?: { message?: string } }).response?.message ?? (e as Error).message });
      }
    }
    const created = results.filter((x) => x.ok).length;
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Account',
      entityId: 'IMPORT',
      afterData: { created, failed: results.length - created, names: results.filter((x) => x.ok).map((x) => x.name) } as Prisma.InputJsonValue,
      remark: `员工信息表批量开通账号：成功 ${created}，失败/跳过 ${results.length - created}`,
      tenantId: this.tenantId,
      storeId: store.id,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return { created, failed: results.filter((x) => !x.ok), results };
  }

  /** 把表里的合同类型、社保、身份证、工资卡、开户行、备注写进刚建好的员工档案（对不上/不合法的项目跳过，不影响开通账号） */
  private async writeProfileDetails(accountId: string, r: ImportRow) {
    const data: Prisma.EmployeeProfileUncheckedUpdateInput = {};
    if (r.contractType && CONTRACT[r.contractType]) data.contractType = CONTRACT[r.contractType];
    if (r.socialInsurance) data.socialInsurance = (r.socialInsurance === '参保' ? 'ENROLLED' : 'NOT_ENROLLED') as SocialInsuranceStatus;
    if (r.idCardNo) {
      const c = checkIdCard(r.idCardNo);
      if (c.valid && !(await this.prisma.employeeProfile.findFirst({ where: { tenantId: this.tenantId, idCardNo: c.normalized } }))) {
        data.idCardNo = c.normalized;
        data.gender = c.gender;
        data.birthDate = new Date(`${c.birthday}T00:00:00.000Z`);
      }
    }
    if (r.bankAccountNo && /^\d{6,32}$/.test(r.bankAccountNo)) data.bankAccountNo = r.bankAccountNo;
    if (r.bankName) data.bankName = r.bankName.slice(0, 100);
    if (r.remark) data.remark = r.remark;
    if (Object.keys(data).length === 0) return;
    await this.prisma.employeeProfile.update({ where: { accountId }, data });
  }
}
