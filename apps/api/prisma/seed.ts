/**
 * P0 本地开发种子数据。密码仅供本地开发登录使用，不是生产凭证——
 * 见 apps/api/.env 的 SEED_DEV_PASSWORD（未设置时回退到下面的默认值）。
 */
import { PrismaClient, PermissionPointType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generateBusinessNo } from '../src/common/utils/business-no.util';

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_DEV_PASSWORD ?? 'Passw0rd!23';

interface PermSpec {
  code: string;
  name: string;
  type: PermissionPointType;
  parentCode?: string;
  isSensitive?: boolean;
}

async function main() {
  console.log('开始 seed...');

  // ---------- 平台基础资料 ----------
  const tenant = await prisma.tenant.upsert({
    where: { code: 'banyuexuan' },
    update: {},
    create: { code: 'banyuexuan', name: '伴月轩月子中心（示例租户）' },
  });

  const region = await prisma.region.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    update: {},
    create: { tenantId: tenant.id, code: 'HQ', name: '总部区域', createdBy: 'SEED' },
  });

  const store = await prisma.store.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ST001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      regionId: region.id,
      code: 'ST001',
      name: '伴月轩·示例店',
      status: 'ACTIVE',
      createdBy: 'SEED',
    },
  });

  const department = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DEPT_MGMT' } },
    update: {},
    create: {
      tenantId: tenant.id,
      storeId: store.id,
      code: 'DEPT_MGMT',
      name: '管理部',
      createdBy: 'SEED',
    },
  });

  const team = await prisma.team.upsert({
    where: { departmentId_code: { departmentId: department.id, code: 'TEAM_PLATFORM' } },
    update: {},
    create: {
      tenantId: tenant.id,
      storeId: store.id,
      departmentId: department.id,
      code: 'TEAM_PLATFORM',
      name: '平台管理组',
      createdBy: 'SEED',
    },
  });

  const position = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'POS_ADMIN' } },
    update: {},
    create: { tenantId: tenant.id, code: 'POS_ADMIN', name: '系统管理员', createdBy: 'SEED' },
  });

  const application = await prisma.application.upsert({
    where: { code: 'admin-web' },
    update: {},
    create: { code: 'admin-web', name: '后台管理前端（预留）', type: 'WEB', createdBy: 'SEED' },
  });

  // ---------- RBAC 四级权限目录 ----------
  const permSpecs: PermSpec[] = [
    { code: 'platform', name: '平台管理', type: 'MODULE' },
    ...[
      'tenant',
      'region',
      'store',
      'department',
      'team',
      'position',
      'account',
      'role',
      'permission',
      'application',
      'tag',
      'parameter',
    ].map((sub) => ({ code: `platform.${sub}`, name: `平台管理-${sub}`, type: 'PAGE' as const, parentCode: 'platform' })),

    { code: 'workflow', name: '审批流程', type: 'MODULE' },
    { code: 'workflow.instance', name: '审批流程-实例', type: 'PAGE', parentCode: 'workflow' },
    { code: 'workflow.demo-approval', name: '审批流程-示例审批单', type: 'PAGE', parentCode: 'workflow' },

    { code: 'audit', name: '审计日志', type: 'MODULE' },
    { code: 'audit.log', name: '审计日志-查询', type: 'PAGE', parentCode: 'audit' },

    { code: 'crm', name: '客户与线索管理', type: 'MODULE' },
    { code: 'crm.customer', name: 'CRM-客户', type: 'PAGE', parentCode: 'crm' },
    { code: 'crm.lead', name: 'CRM-线索', type: 'PAGE', parentCode: 'crm' },
    { code: 'crm.opportunity', name: 'CRM-销售机会', type: 'PAGE', parentCode: 'crm' },
    { code: 'crm.follow-up', name: 'CRM-跟进记录', type: 'PAGE', parentCode: 'crm' },

    { code: 'contract', name: '合同管理', type: 'MODULE' },
    { code: 'contract.template', name: '合同管理-合同模板', type: 'PAGE', parentCode: 'contract' },
    { code: 'contract.record', name: '合同管理-合同', type: 'PAGE', parentCode: 'contract' },

    { code: 'platform.account.field.phone.view', name: '账号-手机号字段', type: 'FIELD', parentCode: 'platform.account', isSensitive: true },
    { code: 'crm.customer.field.phone.view', name: 'CRM-客户-手机号字段', type: 'FIELD', parentCode: 'crm.customer', isSensitive: true },
  ];

  for (const sub of [
    'tenant',
    'region',
    'store',
    'department',
    'team',
    'position',
    'account',
    'role',
    'permission',
    'application',
    'tag',
    'parameter',
  ]) {
    for (const action of ['view', 'create', 'update', 'delete']) {
      permSpecs.push({
        code: `platform.${sub}.${action}`,
        name: `平台管理-${sub}-${action}`,
        type: 'BUTTON',
        parentCode: `platform.${sub}`,
      });
    }
  }
  for (const action of ['view', 'approve', 'reject', 'withdraw', 'reassign', 'add-approver', 'cc', 'archive']) {
    permSpecs.push({
      code: `workflow.instance.${action}`,
      name: `审批流程-实例-${action}`,
      type: 'BUTTON',
      parentCode: 'workflow.instance',
    });
  }
  for (const action of ['view', 'create']) {
    permSpecs.push({
      code: `workflow.demo-approval.${action}`,
      name: `审批流程-示例审批单-${action}`,
      type: 'BUTTON',
      parentCode: 'workflow.demo-approval',
    });
  }
  permSpecs.push({ code: 'audit.log.view', name: '审计日志-查询-view', type: 'BUTTON', parentCode: 'audit.log' });

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `crm.customer.${action}`, name: `CRM-客户-${action}`, type: 'BUTTON', parentCode: 'crm.customer' });
  }
  for (const action of ['view', 'create', 'update', 'assign', 'convert', 'lose']) {
    permSpecs.push({ code: `crm.lead.${action}`, name: `CRM-线索-${action}`, type: 'BUTTON', parentCode: 'crm.lead' });
  }
  for (const action of ['view', 'create', 'update', 'advance-stage', 'lose']) {
    permSpecs.push({ code: `crm.opportunity.${action}`, name: `CRM-销售机会-${action}`, type: 'BUTTON', parentCode: 'crm.opportunity' });
  }
  for (const action of ['view', 'create']) {
    permSpecs.push({ code: `crm.follow-up.${action}`, name: `CRM-跟进记录-${action}`, type: 'BUTTON', parentCode: 'crm.follow-up' });
  }

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `contract.template.${action}`, name: `合同管理-合同模板-${action}`, type: 'BUTTON', parentCode: 'contract.template' });
  }
  for (const action of ['view', 'create', 'update', 'sign', 'submit', 'void', 'renew']) {
    permSpecs.push({ code: `contract.record.${action}`, name: `合同管理-合同-${action}`, type: 'BUTTON', parentCode: 'contract.record' });
  }

  const codeToId = new Map<string, string>();
  // 先建父节点（MODULE），保证 parentId 可解析
  for (const spec of permSpecs.filter((p) => p.type === 'MODULE')) {
    const created = await prisma.permissionPoint.upsert({
      where: { code: spec.code },
      update: {},
      create: {
        code: spec.code,
        name: spec.name,
        type: spec.type,
        applicationId: application.id,
        isSensitive: spec.isSensitive ?? false,
      },
    });
    codeToId.set(spec.code, created.id);
  }
  for (const spec of permSpecs.filter((p) => p.type === 'PAGE')) {
    const created = await prisma.permissionPoint.upsert({
      where: { code: spec.code },
      update: {},
      create: {
        code: spec.code,
        name: spec.name,
        type: spec.type,
        parentId: spec.parentCode ? codeToId.get(spec.parentCode) : undefined,
        applicationId: application.id,
        isSensitive: spec.isSensitive ?? false,
      },
    });
    codeToId.set(spec.code, created.id);
  }
  for (const spec of permSpecs.filter((p) => p.type === 'BUTTON' || p.type === 'FIELD')) {
    const created = await prisma.permissionPoint.upsert({
      where: { code: spec.code },
      update: {},
      create: {
        code: spec.code,
        name: spec.name,
        type: spec.type,
        parentId: spec.parentCode ? codeToId.get(spec.parentCode) : undefined,
        applicationId: application.id,
        isSensitive: spec.isSensitive ?? false,
      },
    });
    codeToId.set(spec.code, created.id);
  }

  console.log(`权限点目录：共 ${codeToId.size} 条`);

  // ---------- 角色 ----------
  const superAdminRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SUPER_ADMIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'SUPER_ADMIN',
      name: '超级管理员',
      description: '拥有全部权限的内置系统角色',
      isSystem: true,
      createdBy: 'SEED',
    },
  });

  const storeManagerRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STORE_MANAGER' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'STORE_MANAGER',
      name: '店长',
      description: '门店日常管理与一级审批，无账号手机号查看权限、无门店删除权限',
      createdBy: 'SEED',
    },
  });

  // SUPER_ADMIN 拥有全部权限点
  for (const permissionPointId of codeToId.values()) {
    await prisma.roleOnPermission
      .upsert({
        where: { roleId_permissionPointId: { roleId: superAdminRole.id, permissionPointId } },
        update: {},
        create: { roleId: superAdminRole.id, permissionPointId, createdBy: 'SEED' },
      })
      .catch(() => undefined);
  }

  // STORE_MANAGER：有意缺 platform.store.delete 与 platform.account.field.phone.view，用于验证 403 与字段掩码；
  // CRM 的 lose（线索/机会标记流失）、合同的 void（作废）同理有意缺失——影响统计口径/具有终局性的
  // 操作先只给 SUPER_ADMIN。合同模板（法律文本主数据）也不开放给 STORE_MANAGER，与 Parameter/Tag/Region
  // 这类主数据现在的处理口径一致。
  const storeManagerExcluded = new Set([
    'platform.store.delete',
    'platform.account.field.phone.view',
    'crm.customer.field.phone.view',
    'crm.lead.lose',
    'crm.opportunity.lose',
    'contract.record.void',
  ]);
  const storeManagerCodes = permSpecs
    .map((p) => p.code)
    .filter(
      (code) =>
        !storeManagerExcluded.has(code) &&
        (code.startsWith('platform.store') ||
          code.startsWith('platform.account') ||
          code === 'workflow' ||
          code.startsWith('workflow.instance') ||
          code.startsWith('workflow.demo-approval') ||
          code === 'audit' ||
          code === 'audit.log' ||
          code === 'audit.log.view' ||
          code === 'platform' ||
          code.startsWith('crm') ||
          code.startsWith('contract.record')),
    );
  for (const code of storeManagerCodes) {
    const permissionPointId = codeToId.get(code);
    if (!permissionPointId) continue;
    await prisma.roleOnPermission
      .upsert({
        where: { roleId_permissionPointId: { roleId: storeManagerRole.id, permissionPointId } },
        update: {},
        create: { roleId: storeManagerRole.id, permissionPointId, createdBy: 'SEED' },
      })
      .catch(() => undefined);
  }

  // ---------- 账号 ----------
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const adminAccount = await prisma.account.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      storeId: store.id,
      departmentId: department.id,
      teamId: team.id,
      positionId: position.id,
      username: 'admin',
      realName: '超级管理员',
      phone: '13800000000',
      passwordHash,
      createdBy: 'SEED',
    },
  });

  const storeManagerAccount = await prisma.account.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'store_manager' } },
    update: {},
    create: {
      tenantId: tenant.id,
      storeId: store.id,
      departmentId: department.id,
      teamId: team.id,
      positionId: position.id,
      username: 'store_manager',
      realName: '示例店店长',
      phone: '13900000000',
      passwordHash,
      createdBy: 'SEED',
    },
  });

  await prisma.accountRoleAssignment.upsert({
    where: { id: `seed-admin-${superAdminRole.id}` },
    update: {},
    create: {
      id: `seed-admin-${superAdminRole.id}`,
      tenantId: tenant.id,
      accountId: adminAccount.id,
      roleId: superAdminRole.id,
      scopeType: 'TENANT',
      grantedBy: 'SEED',
    },
  });

  await prisma.accountRoleAssignment.upsert({
    where: { id: `seed-storemgr-${storeManagerRole.id}` },
    update: {},
    create: {
      id: `seed-storemgr-${storeManagerRole.id}`,
      tenantId: tenant.id,
      accountId: storeManagerAccount.id,
      roleId: storeManagerRole.id,
      scopeType: 'STORE',
      scopeId: store.id,
      grantedBy: 'SEED',
    },
  });

  // ---------- 工作流定义：DEMO_APPROVAL ----------
  const workflowDefinition = await prisma.workflowDefinition.upsert({
    where: { tenantId_code_version: { tenantId: tenant.id, code: 'DEMO_APPROVAL', version: 1 } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'DEMO_APPROVAL',
      name: '示例审批单',
      version: 1,
      status: 'PUBLISHED',
      createdBy: 'SEED',
    },
  });

  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: workflowDefinition.id, seq: 1 } },
    update: {},
    create: {
      workflowDefinitionId: workflowDefinition.id,
      seq: 1,
      name: '店长初审',
      approverType: 'ROLE',
      approverRoleId: storeManagerRole.id,
    },
  });
  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: workflowDefinition.id, seq: 2 } },
    update: {},
    create: {
      workflowDefinitionId: workflowDefinition.id,
      seq: 2,
      name: '平台管理员终审',
      approverType: 'ROLE',
      approverRoleId: superAdminRole.id,
    },
  });

  // ---------- 工作流定义：CONTRACT_SIGNING ----------
  const contractSigningDefinition = await prisma.workflowDefinition.upsert({
    where: { tenantId_code_version: { tenantId: tenant.id, code: 'CONTRACT_SIGNING', version: 1 } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'CONTRACT_SIGNING',
      name: '合同签约审核',
      version: 1,
      status: 'PUBLISHED',
      createdBy: 'SEED',
    },
  });

  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: contractSigningDefinition.id, seq: 1 } },
    update: {},
    create: {
      workflowDefinitionId: contractSigningDefinition.id,
      seq: 1,
      name: '店长初审',
      approverType: 'ROLE',
      approverRoleId: storeManagerRole.id,
    },
  });
  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: contractSigningDefinition.id, seq: 2 } },
    update: {},
    create: {
      workflowDefinitionId: contractSigningDefinition.id,
      seq: 2,
      name: '平台管理员终审',
      approverType: 'ROLE',
      approverRoleId: superAdminRole.id,
    },
  });

  // ---------- 参数 ----------
  const parameters: { key: string; value: string; description: string }[] = [
    { key: 'platform.password_policy.min_length', value: '8', description: '密码最小长度' },
    { key: 'platform.session.access_token_ttl_minutes', value: '30', description: 'Access Token 有效期（分钟）' },
    { key: 'platform.session.refresh_token_ttl_days', value: '14', description: 'Refresh Token 有效期（天）' },
    { key: 'workflow.archive_delay_seconds', value: '60', description: '工作流通过后自动归档延迟秒数' },
  ];
  for (const p of parameters) {
    // Prisma 的复合唯一键在包含可空字段（storeId）时，where 里不接受 null，
    // 因此用 findFirst + 条件 create 代替 upsert（与 ParameterService 里的做法一致）。
    const existing = await prisma.parameter.findFirst({
      where: { tenantId: tenant.id, storeId: null, key: p.key },
    });
    if (!existing) {
      await prisma.parameter.create({
        data: { tenantId: tenant.id, storeId: null, key: p.key, value: p.value, description: p.description, isSystem: true, createdBy: 'SEED' },
      });
    }
  }

  // ---------- 标签：示例标签绑定到示例店 ----------
  const tag = await prisma.tag.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: '示例标签' } },
    update: {},
    create: { tenantId: tenant.id, name: '示例标签', color: '#1f3a5f', createdBy: 'SEED' },
  });
  await prisma.tagBinding.upsert({
    where: { tagId_entityType_entityId: { tagId: tag.id, entityType: 'Store', entityId: store.id } },
    update: {},
    create: { tenantId: tenant.id, tagId: tag.id, entityType: 'Store', entityId: store.id, createdBy: 'SEED' },
  });

  // ---------- CRM 示例数据 ----------
  const demoLead = await prisma.lead.findFirst({
    where: { tenantId: tenant.id, phone: '13700000001' },
  });
  if (!demoLead) {
    await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        leadNo: generateBusinessNo('L'),
        name: '示例线索-张女士',
        phone: '13700000001',
        source: 'ONLINE_AD',
        storeId: store.id,
        status: 'NEW',
        createdBy: 'SEED',
      },
    });
  }

  let demoCustomer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, phone: '13700000002' },
  });
  if (!demoCustomer) {
    demoCustomer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        customerNo: generateBusinessNo('C'),
        name: '示例客户-李女士',
        phone: '13700000002',
        source: 'REFERRAL',
        primaryStoreId: store.id,
        assignedToId: storeManagerAccount.id,
        createdBy: 'SEED',
      },
    });
  }

  const demoOpportunity = await prisma.salesOpportunity.findFirst({
    where: { tenantId: tenant.id, customerId: demoCustomer.id },
  });
  if (!demoOpportunity) {
    await prisma.salesOpportunity.create({
      data: {
        tenantId: tenant.id,
        opportunityNo: generateBusinessNo('O'),
        customerId: demoCustomer.id,
        stage: 'FOLLOWING',
        assignedToId: storeManagerAccount.id,
        createdBy: 'SEED',
      },
    });
  }

  // ---------- 合同示例数据 ----------
  const contractTemplate = await prisma.contractTemplate.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STANDARD_V1' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'STANDARD_V1',
      name: '标准月子套餐合同模板',
      content: '甲方（客户）与乙方（伴月轩月子中心）就月子套餐服务达成以下约定：服务内容、金额、起止日期以合同正文为准。',
      createdBy: 'SEED',
    },
  });

  const demoContract = await prisma.contract.findFirst({
    where: { tenantId: tenant.id, customerId: demoCustomer.id },
  });
  if (!demoContract) {
    await prisma.contract.create({
      data: {
        tenantId: tenant.id,
        contractNo: generateBusinessNo('CT'),
        customerId: demoCustomer.id,
        templateId: contractTemplate.id,
        storeId: store.id,
        title: '示例客户-李女士 月子套餐合同',
        content: contractTemplate.content,
        amount: 8800000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'DRAFT',
        createdBy: 'SEED',
      },
    });
  }

  console.log('seed 完成:');
  console.log(`  租户: ${tenant.code} / 门店: ${store.code} / 区域: ${region.code}`);
  console.log(`  账号: admin / store_manager（密码见 SEED_DEV_PASSWORD，默认 ${SEED_PASSWORD}）`);
  console.log(`  工作流定义: DEMO_APPROVAL（店长初审 -> 平台管理员终审）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
