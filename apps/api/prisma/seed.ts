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

    { code: 'room', name: '房态预订', type: 'MODULE' },
    { code: 'room.type', name: '房态预订-房型', type: 'PAGE', parentCode: 'room' },
    { code: 'room.room', name: '房态预订-房间', type: 'PAGE', parentCode: 'room' },
    { code: 'room.occupancy', name: '房态预订-占用记录', type: 'PAGE', parentCode: 'room' },
    { code: 'room.call', name: '房态预订-呼叫记录', type: 'PAGE', parentCode: 'room' },
    { code: 'room.outing', name: '房态预订-外出管理', type: 'PAGE', parentCode: 'room' },
    { code: 'room.service-requisition', name: '房态预订-客房服务领用', type: 'PAGE', parentCode: 'room' },

    { code: 'payment', name: '收款管理', type: 'MODULE' },
    { code: 'payment.record', name: '收款管理-收款', type: 'PAGE', parentCode: 'payment' },

    { code: 'care', name: '护理', type: 'MODULE' },
    { code: 'care.field', name: '护理-护理字段管理', type: 'PAGE', parentCode: 'care' },
    { code: 'care.form-template', name: '护理-护理项目管理', type: 'PAGE', parentCode: 'care' },
    { code: 'care.plan-template', name: '护理-护理方案管理', type: 'PAGE', parentCode: 'care' },
    { code: 'care.profile', name: '护理-母婴档案', type: 'PAGE', parentCode: 'care' },
    { code: 'care.plan', name: '护理-护理计划', type: 'PAGE', parentCode: 'care' },
    { code: 'care.record', name: '护理-护理记录', type: 'PAGE', parentCode: 'care' },
    { code: 'care.abnormality', name: '护理-护理异常', type: 'PAGE', parentCode: 'care' },

    { code: 'meal', name: '月子餐', type: 'MODULE' },
    { code: 'meal.item', name: '月子餐-菜品管理', type: 'PAGE', parentCode: 'meal' },
    { code: 'meal.dietary-restriction', name: '月子餐-禁忌管理', type: 'PAGE', parentCode: 'meal' },
    { code: 'meal.plan-template', name: '月子餐-膳食计划管理', type: 'PAGE', parentCode: 'meal' },
    { code: 'meal.diner-profile', name: '月子餐-用膳人', type: 'PAGE', parentCode: 'meal' },
    { code: 'meal.record', name: '月子餐-排餐记录', type: 'PAGE', parentCode: 'meal' },

    { code: 'service', name: '产康服务', type: 'MODULE' },
    { code: 'service.product', name: '产康服务-项目', type: 'PAGE', parentCode: 'service' },
    { code: 'service.package', name: '产康服务-服务包', type: 'PAGE', parentCode: 'service' },
    { code: 'service.therapist', name: '产康服务-技师', type: 'PAGE', parentCode: 'service' },
    { code: 'service.customer-package', name: '产康服务-客户已购服务包', type: 'PAGE', parentCode: 'service' },
    { code: 'service.appointment', name: '产康服务-预约', type: 'PAGE', parentCode: 'service' },

    { code: 'inventory', name: '库存', type: 'MODULE' },
    { code: 'inventory.supplier', name: '库存-供应商', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.warehouse', name: '库存-仓库', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.item', name: '库存-物品', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.warehouse-stock', name: '库存-库存查询', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.stock-batch', name: '库存-批次与效期', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.purchase-order', name: '库存-采购单', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.goods-receipt', name: '库存-入库单', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.stock-issue', name: '库存-出库/领用单', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.stock-transfer', name: '库存-调拨单', type: 'PAGE', parentCode: 'inventory' },
    { code: 'inventory.stock-count', name: '库存-盘点单', type: 'PAGE', parentCode: 'inventory' },

    { code: 'hr', name: '人事', type: 'MODULE' },
    { code: 'hr.employee-profile', name: '人事-员工档案', type: 'PAGE', parentCode: 'hr' },
    { code: 'hr.shift-definition', name: '人事-班次定义', type: 'PAGE', parentCode: 'hr' },
    { code: 'hr.schedule-entry', name: '人事-排班', type: 'PAGE', parentCode: 'hr' },
    { code: 'hr.commission-record', name: '人事-业绩提成', type: 'PAGE', parentCode: 'hr' },
    { code: 'hr.payroll-record', name: '人事-薪资单', type: 'PAGE', parentCode: 'hr' },

    { code: 'finance', name: '财务结算', type: 'MODULE' },
    { code: 'finance.customer-account', name: '财务结算-会员账户', type: 'PAGE', parentCode: 'finance' },

    { code: 'office', name: '办公审批', type: 'MODULE' },
    { code: 'office.leave-request', name: '办公审批-请假申请', type: 'PAGE', parentCode: 'office' },
    { code: 'office.expense-claim', name: '办公审批-报销申请', type: 'PAGE', parentCode: 'office' },
    { code: 'office.general-memo', name: '办公审批-日常签呈', type: 'PAGE', parentCode: 'office' },

    { code: 'logistics', name: '后勤管理', type: 'MODULE' },
    { code: 'logistics.vehicle', name: '后勤管理-车辆管理', type: 'PAGE', parentCode: 'logistics' },
    { code: 'logistics.vehicle-booking', name: '后勤管理-用车申请', type: 'PAGE', parentCode: 'logistics' },
    { code: 'logistics.utility-expense', name: '后勤管理-水电费登记', type: 'PAGE', parentCode: 'logistics' },

    { code: 'ai', name: 'AI助手', type: 'MODULE' },
    { code: 'ai.customer-service-agent', name: 'AI助手-智能客服', type: 'PAGE', parentCode: 'ai' },
    { code: 'ai.care-abnormality-agent', name: 'AI助手-护理异常建议', type: 'PAGE', parentCode: 'ai' },
    { code: 'ai.suggestion', name: 'AI助手-建议记录', type: 'PAGE', parentCode: 'ai' },
    { code: 'ai.knowledge-document', name: 'AI助手-知识库文档', type: 'PAGE', parentCode: 'ai' },
    { code: 'ai.business-analytics-agent', name: 'AI助手-经营分析解读', type: 'PAGE', parentCode: 'ai' },

    { code: 'iot', name: '设备网关', type: 'MODULE' },
    { code: 'iot.device-type', name: '设备网关-设备类型', type: 'PAGE', parentCode: 'iot' },
    { code: 'iot.device-registry', name: '设备网关-设备台账', type: 'PAGE', parentCode: 'iot' },
    { code: 'iot.device-event', name: '设备网关-事件与模拟', type: 'PAGE', parentCode: 'iot' },

    { code: 'analytics', name: '经营分析', type: 'MODULE' },
    { code: 'analytics.dashboard', name: '经营分析-看板', type: 'PAGE', parentCode: 'analytics' },

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

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `room.type.${action}`, name: `房态预订-房型-${action}`, type: 'BUTTON', parentCode: 'room.type' });
  }
  for (const action of ['view', 'create', 'update', 'maintenance', 'clean']) {
    permSpecs.push({ code: `room.room.${action}`, name: `房态预订-房间-${action}`, type: 'BUTTON', parentCode: 'room.room' });
  }
  for (const action of ['view', 'create', 'checkin', 'checkout', 'cancel']) {
    permSpecs.push({ code: `room.occupancy.${action}`, name: `房态预订-占用记录-${action}`, type: 'BUTTON', parentCode: 'room.occupancy' });
  }
  for (const action of ['view', 'create', 'handle']) {
    permSpecs.push({ code: `room.call.${action}`, name: `房态预订-呼叫记录-${action}`, type: 'BUTTON', parentCode: 'room.call' });
  }
  for (const action of ['view', 'create', 'checkout', 'checkback', 'cancel']) {
    permSpecs.push({ code: `room.outing.${action}`, name: `房态预订-外出管理-${action}`, type: 'BUTTON', parentCode: 'room.outing' });
  }
  for (const action of ['view', 'create', 'fulfill']) {
    permSpecs.push({
      code: `room.service-requisition.${action}`,
      name: `房态预订-客房服务领用-${action}`,
      type: 'BUTTON',
      parentCode: 'room.service-requisition',
    });
  }
  for (const action of ['view', 'create', 'refund']) {
    permSpecs.push({ code: `payment.record.${action}`, name: `收款管理-收款-${action}`, type: 'BUTTON', parentCode: 'payment.record' });
  }

  for (const action of ['view', 'create', 'update', 'delete']) {
    permSpecs.push({ code: `care.field.${action}`, name: `护理-护理字段管理-${action}`, type: 'BUTTON', parentCode: 'care.field' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `care.form-template.${action}`, name: `护理-护理项目管理-${action}`, type: 'BUTTON', parentCode: 'care.form-template' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `care.plan-template.${action}`, name: `护理-护理方案管理-${action}`, type: 'BUTTON', parentCode: 'care.plan-template' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `care.profile.${action}`, name: `护理-母婴档案-${action}`, type: 'BUTTON', parentCode: 'care.profile' });
  }
  for (const action of ['view', 'create', 'terminate']) {
    permSpecs.push({ code: `care.plan.${action}`, name: `护理-护理计划-${action}`, type: 'BUTTON', parentCode: 'care.plan' });
  }
  for (const action of ['view', 'create']) {
    permSpecs.push({ code: `care.record.${action}`, name: `护理-护理记录-${action}`, type: 'BUTTON', parentCode: 'care.record' });
  }
  for (const action of ['view', 'follow-up', 'resolve', 'ignore']) {
    permSpecs.push({ code: `care.abnormality.${action}`, name: `护理-护理异常-${action}`, type: 'BUTTON', parentCode: 'care.abnormality' });
  }

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `meal.item.${action}`, name: `月子餐-菜品管理-${action}`, type: 'BUTTON', parentCode: 'meal.item' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({
      code: `meal.dietary-restriction.${action}`,
      name: `月子餐-禁忌管理-${action}`,
      type: 'BUTTON',
      parentCode: 'meal.dietary-restriction',
    });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `meal.plan-template.${action}`, name: `月子餐-膳食计划管理-${action}`, type: 'BUTTON', parentCode: 'meal.plan-template' });
  }
  for (const action of ['view', 'create', 'end']) {
    permSpecs.push({ code: `meal.diner-profile.${action}`, name: `月子餐-用膳人-${action}`, type: 'BUTTON', parentCode: 'meal.diner-profile' });
  }
  for (const action of ['view', 'select', 'serve', 'feedback']) {
    permSpecs.push({ code: `meal.record.${action}`, name: `月子餐-排餐记录-${action}`, type: 'BUTTON', parentCode: 'meal.record' });
  }

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `service.product.${action}`, name: `产康服务-项目-${action}`, type: 'BUTTON', parentCode: 'service.product' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `service.package.${action}`, name: `产康服务-服务包-${action}`, type: 'BUTTON', parentCode: 'service.package' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `service.therapist.${action}`, name: `产康服务-技师-${action}`, type: 'BUTTON', parentCode: 'service.therapist' });
  }
  for (const action of ['view', 'create']) {
    permSpecs.push({
      code: `service.customer-package.${action}`,
      name: `产康服务-客户已购服务包-${action}`,
      type: 'BUTTON',
      parentCode: 'service.customer-package',
    });
  }
  for (const action of ['view', 'create', 'complete', 'cancel', 'feedback']) {
    permSpecs.push({ code: `service.appointment.${action}`, name: `产康服务-预约-${action}`, type: 'BUTTON', parentCode: 'service.appointment' });
  }

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `inventory.supplier.${action}`, name: `库存-供应商-${action}`, type: 'BUTTON', parentCode: 'inventory.supplier' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `inventory.warehouse.${action}`, name: `库存-仓库-${action}`, type: 'BUTTON', parentCode: 'inventory.warehouse' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `inventory.item.${action}`, name: `库存-物品-${action}`, type: 'BUTTON', parentCode: 'inventory.item' });
  }
  permSpecs.push({ code: 'inventory.warehouse-stock.view', name: '库存-库存查询-view', type: 'BUTTON', parentCode: 'inventory.warehouse-stock' });
  permSpecs.push({ code: 'inventory.stock-batch.view', name: '库存-批次与效期-view', type: 'BUTTON', parentCode: 'inventory.stock-batch' });
  for (const action of ['view', 'create', 'submit', 'cancel']) {
    permSpecs.push({ code: `inventory.purchase-order.${action}`, name: `库存-采购单-${action}`, type: 'BUTTON', parentCode: 'inventory.purchase-order' });
  }
  for (const action of ['view', 'create', 'submit', 'execute', 'cancel']) {
    permSpecs.push({ code: `inventory.goods-receipt.${action}`, name: `库存-入库单-${action}`, type: 'BUTTON', parentCode: 'inventory.goods-receipt' });
  }
  for (const action of ['view', 'create', 'submit', 'execute', 'cancel']) {
    permSpecs.push({ code: `inventory.stock-issue.${action}`, name: `库存-出库/领用单-${action}`, type: 'BUTTON', parentCode: 'inventory.stock-issue' });
  }
  for (const action of ['view', 'create', 'submit', 'execute', 'cancel']) {
    permSpecs.push({ code: `inventory.stock-transfer.${action}`, name: `库存-调拨单-${action}`, type: 'BUTTON', parentCode: 'inventory.stock-transfer' });
  }
  for (const action of ['view', 'create', 'submit', 'execute', 'cancel']) {
    permSpecs.push({ code: `inventory.stock-count.${action}`, name: `库存-盘点单-${action}`, type: 'BUTTON', parentCode: 'inventory.stock-count' });
  }

  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `hr.employee-profile.${action}`, name: `人事-员工档案-${action}`, type: 'BUTTON', parentCode: 'hr.employee-profile' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `hr.shift-definition.${action}`, name: `人事-班次定义-${action}`, type: 'BUTTON', parentCode: 'hr.shift-definition' });
  }
  for (const action of ['view', 'create', 'update', 'delete']) {
    permSpecs.push({ code: `hr.schedule-entry.${action}`, name: `人事-排班-${action}`, type: 'BUTTON', parentCode: 'hr.schedule-entry' });
  }
  for (const action of ['view', 'create', 'submit', 'cancel']) {
    permSpecs.push({ code: `hr.commission-record.${action}`, name: `人事-业绩提成-${action}`, type: 'BUTTON', parentCode: 'hr.commission-record' });
  }
  for (const action of ['view', 'create', 'submit', 'mark-paid', 'cancel']) {
    permSpecs.push({ code: `hr.payroll-record.${action}`, name: `人事-薪资单-${action}`, type: 'BUTTON', parentCode: 'hr.payroll-record' });
  }
  for (const action of ['view', 'recharge', 'consume', 'refund', 'adjust']) {
    permSpecs.push({ code: `finance.customer-account.${action}`, name: `财务结算-会员账户-${action}`, type: 'BUTTON', parentCode: 'finance.customer-account' });
  }
  for (const action of ['view', 'create', 'submit', 'cancel']) {
    permSpecs.push({ code: `office.leave-request.${action}`, name: `办公审批-请假申请-${action}`, type: 'BUTTON', parentCode: 'office.leave-request' });
  }
  for (const action of ['view', 'create', 'submit', 'cancel']) {
    permSpecs.push({ code: `office.expense-claim.${action}`, name: `办公审批-报销申请-${action}`, type: 'BUTTON', parentCode: 'office.expense-claim' });
  }
  for (const action of ['view', 'create', 'submit', 'cancel']) {
    permSpecs.push({ code: `office.general-memo.${action}`, name: `办公审批-日常签呈-${action}`, type: 'BUTTON', parentCode: 'office.general-memo' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `logistics.vehicle.${action}`, name: `后勤管理-车辆管理-${action}`, type: 'BUTTON', parentCode: 'logistics.vehicle' });
  }
  for (const action of ['view', 'create', 'cancel']) {
    permSpecs.push({ code: `logistics.vehicle-booking.${action}`, name: `后勤管理-用车申请-${action}`, type: 'BUTTON', parentCode: 'logistics.vehicle-booking' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `logistics.utility-expense.${action}`, name: `后勤管理-水电费登记-${action}`, type: 'BUTTON', parentCode: 'logistics.utility-expense' });
  }
  permSpecs.push({ code: 'ai.customer-service-agent.ask', name: 'AI助手-智能客服-ask', type: 'BUTTON', parentCode: 'ai.customer-service-agent' });
  permSpecs.push({ code: 'ai.care-abnormality-agent.suggest', name: 'AI助手-护理异常建议-suggest', type: 'BUTTON', parentCode: 'ai.care-abnormality-agent' });
  for (const action of ['view', 'accept', 'dismiss']) {
    permSpecs.push({ code: `ai.suggestion.${action}`, name: `AI助手-建议记录-${action}`, type: 'BUTTON', parentCode: 'ai.suggestion' });
  }
  for (const action of ['view', 'create', 'update', 'delete']) {
    permSpecs.push({ code: `ai.knowledge-document.${action}`, name: `AI助手-知识库文档-${action}`, type: 'BUTTON', parentCode: 'ai.knowledge-document' });
  }
  permSpecs.push({ code: 'ai.business-analytics-agent.analyze', name: 'AI助手-经营分析解读-analyze', type: 'BUTTON', parentCode: 'ai.business-analytics-agent' });
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `iot.device-type.${action}`, name: `设备网关-设备类型-${action}`, type: 'BUTTON', parentCode: 'iot.device-type' });
  }
  for (const action of ['view', 'create', 'update']) {
    permSpecs.push({ code: `iot.device-registry.${action}`, name: `设备网关-设备台账-${action}`, type: 'BUTTON', parentCode: 'iot.device-registry' });
  }
  for (const action of ['view', 'simulate', 'issue-command', 'confirm-command']) {
    permSpecs.push({ code: `iot.device-event.${action}`, name: `设备网关-事件与模拟-${action}`, type: 'BUTTON', parentCode: 'iot.device-event' });
  }
  permSpecs.push({ code: 'analytics.dashboard.view', name: '经营分析-看板-view', type: 'BUTTON', parentCode: 'analytics.dashboard' });

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
  // 这类主数据现在的处理口径一致。房型（room.type）同理是平台级主数据，不开放给 STORE_MANAGER；
  // 房间与占用记录（room.room / room.occupancy）是前台/店长的日常操作，全部动作开放，不额外排除。
  // 收款（payment.record）同理——退款的"提交申请"是前台日常操作，真正的审批权由通用工作流
  // 引擎的审批人角色把关，不在这一层额外收紧，全部动作开放。
  // 护理表单引擎配置（care.field / care.form-template / care.plan-template）是总部制定的
  // 临床协议主数据，同 room.type/contract.template 口径不开放给 STORE_MANAGER；母婴档案
  // （care.profile）是护理人员/前台的日常操作，全部动作开放。
  // 月子餐同理：菜品/禁忌/膳食计划模板（meal.item/dietary-restriction/plan-template）是总部制定的
  // 营养配餐主数据，不开放；用膳人与排餐记录（meal.diner-profile/record）是护理/膳食人员的日常
  // 操作，全部动作开放。产康服务：项目/服务包/技师（service.product/package/therapist）是总部
  // 定价与人力主数据，不开放；客户已购服务包与预约（service.customer-package/appointment）是
  // 前台/技师的日常操作，全部动作开放。库存域：物品/供应商（inventory.item/supplier）是总部
  // 制定的采购目录与供应商关系，同 room.type/meal.item 口径不开放；仓库（inventory.warehouse）
  // 是各门店自行管理的经营容器，同 room.room 口径开放；库存查询与批次效期（只读）开放给店长
  // 做日常盘点/预警巡查；五种单据（采购/入库/出库领用/调拨/盘点）是店长/仓管的日常操作，
  // 全部动作开放——真正的审批权由通用工作流引擎的审批人角色把关，同 payment.record 口径。
  // 人事域：员工档案/班次定义/排班/业绩提成/薪资单都是店长日常管理自己门店员工的操作
  // （店长本身就是提成/薪资审批人），全部动作开放，不额外收紧。
  // 财务结算-会员账户：充值/消费/退款是有实际业务凭证支撑的前台日常操作，开放给店长；
  // "人工调整"(finance.customer-account.adjust)是脱离正常业务凭证、可任意改动余额的纠错
  // 操作，风险等级同"作废/标记流失"，只留给 SUPER_ADMIN。
  // 办公审批：请假/报销/签呈都是店长日常审批自己门店事务的操作（店长本身就是审批人），
  // 全部动作开放，不额外收紧，同 hr.commission-record/payroll-record 口径。
  // 后勤管理：车辆主数据(logistics.vehicle)新增/停用车辆属于总部决策，不开放
  // create/update 给 STORE_MANAGER；但 view 需要开放——店长发起用车申请时要能看到
  // 车辆列表去选择，与"总部主数据不可编辑但日常业务要能引用"这个诉求一致。用车申请
  // (logistics.vehicle-booking)与水电费登记(logistics.utility-expense)是店长日常操作，
  // 全部动作开放。
  // AI助手：智能客服/护理异常建议都是帮员工日常工作的辅助工具（AI只生成建议、不代替
  // 人工决策），全部动作开放给STORE_MANAGER，不额外收紧。知识库文档(ai.knowledge-document)
  // 是被全租户共享的AI参考内容源，同 care.field/room.type 这类总部主数据口径，不开放给
  // STORE_MANAGER编辑，避免多店各自维护导致AI回答口径不一致。
  // 设备网关：设备类型(iot.device-type，协议/品类主数据)同 room.type/care.field 口径不开放
  // create/update 给STORE_MANAGER；但view需要开放——店长登记设备台账时要选择设备类型，
  // 同 logistics.vehicle 口径（车辆主数据不可编辑但用车申请要能引用）。设备台账
  // (iot.device-registry)是各门店自己安装/更换的物理资产，同 room.room/warehouse口径，
  // 店长可自行管理；事件与模拟(iot.device-event，含模拟上报/下发指令/确认指令)是日常
  // 验证/排查设备联通性的操作，同样开放给店长。
  // 经营分析：看板(analytics.dashboard)与AI经营分析解读(ai.business-analytics-agent)都开放给
  // 店长——查询范围由BusinessReportService按DataScopeService强制收紧到店长自己门店，不依赖
  // 权限点本身做门店隔离，同AiSuggestion其他两个Agent"辅助工具、全部动作开放"的口径一致。
  const storeManagerExcluded = new Set([
    'platform.store.delete',
    'platform.account.field.phone.view',
    'crm.customer.field.phone.view',
    'crm.lead.lose',
    'crm.opportunity.lose',
    'contract.record.void',
    'finance.customer-account.adjust',
    'logistics.vehicle.create',
    'logistics.vehicle.update',
    'iot.device-type.create',
    'iot.device-type.update',
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
          code.startsWith('contract.record') ||
          code.startsWith('room.room') ||
          code.startsWith('room.occupancy') ||
          code.startsWith('room.call') ||
          code.startsWith('room.outing') ||
          code.startsWith('room.service-requisition') ||
          code.startsWith('payment.record') ||
          code.startsWith('care.profile') ||
          code === 'care.plan' ||
          code.startsWith('care.plan.') ||
          code.startsWith('care.record') ||
          code.startsWith('care.abnormality') ||
          code.startsWith('meal.diner-profile') ||
          code.startsWith('meal.record') ||
          code.startsWith('service.customer-package') ||
          code.startsWith('service.appointment') ||
          code.startsWith('inventory.warehouse') ||
          code.startsWith('inventory.stock-batch') ||
          code.startsWith('inventory.purchase-order') ||
          code.startsWith('inventory.goods-receipt') ||
          code.startsWith('inventory.stock-issue') ||
          code.startsWith('inventory.stock-transfer') ||
          code.startsWith('inventory.stock-count') ||
          code.startsWith('hr.employee-profile') ||
          code.startsWith('hr.shift-definition') ||
          code.startsWith('hr.schedule-entry') ||
          code.startsWith('hr.commission-record') ||
          code.startsWith('hr.payroll-record') ||
          code.startsWith('finance.customer-account') ||
          code.startsWith('office.leave-request') ||
          code.startsWith('office.expense-claim') ||
          code.startsWith('office.general-memo') ||
          code.startsWith('logistics.vehicle') ||
          code.startsWith('logistics.utility-expense') ||
          code.startsWith('ai.customer-service-agent') ||
          code.startsWith('ai.care-abnormality-agent') ||
          code.startsWith('ai.suggestion') ||
          code.startsWith('iot.device-type') ||
          code.startsWith('iot.device-registry') ||
          code.startsWith('iot.device-event') ||
          code.startsWith('ai.business-analytics-agent') ||
          code.startsWith('analytics.dashboard')),
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

  // ---------- 工作流定义：PAYMENT_REFUND（只给一个审批节点，不像合同签约那样需要平台管理员终审） ----------
  const paymentRefundDefinition = await prisma.workflowDefinition.upsert({
    where: { tenantId_code_version: { tenantId: tenant.id, code: 'PAYMENT_REFUND', version: 1 } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'PAYMENT_REFUND',
      name: '收款退款审批',
      version: 1,
      status: 'PUBLISHED',
      createdBy: 'SEED',
    },
  });
  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: paymentRefundDefinition.id, seq: 1 } },
    update: {},
    create: {
      workflowDefinitionId: paymentRefundDefinition.id,
      seq: 1,
      name: '店长审批',
      approverType: 'ROLE',
      approverRoleId: storeManagerRole.id,
    },
  });

  // ---------- 工作流定义：库存域五种单据审批，均只给一个店长审批节点 ----------
  const inventoryWorkflowDefs: { code: string; name: string }[] = [
    { code: 'INVENTORY_PURCHASE', name: '采购单审批' },
    { code: 'INVENTORY_GOODS_RECEIPT', name: '入库单审批' },
    { code: 'INVENTORY_STOCK_ISSUE', name: '出库/领用单审批' },
    { code: 'INVENTORY_STOCK_TRANSFER', name: '调拨单审批' },
    { code: 'INVENTORY_STOCK_COUNT', name: '盘点单盈亏审批' },
  ];
  for (const def of inventoryWorkflowDefs) {
    const definition = await prisma.workflowDefinition.upsert({
      where: { tenantId_code_version: { tenantId: tenant.id, code: def.code, version: 1 } },
      update: {},
      create: { tenantId: tenant.id, code: def.code, name: def.name, version: 1, status: 'PUBLISHED', createdBy: 'SEED' },
    });
    await prisma.workflowNode.upsert({
      where: { workflowDefinitionId_seq: { workflowDefinitionId: definition.id, seq: 1 } },
      update: {},
      create: { workflowDefinitionId: definition.id, seq: 1, name: '店长审批', approverType: 'ROLE', approverRoleId: storeManagerRole.id },
    });
  }

  // ---------- 工作流定义：HR_COMMISSION（业绩提成，单节点店长审批） ----------
  const commissionDefinition = await prisma.workflowDefinition.upsert({
    where: { tenantId_code_version: { tenantId: tenant.id, code: 'HR_COMMISSION', version: 1 } },
    update: {},
    create: { tenantId: tenant.id, code: 'HR_COMMISSION', name: '业绩提成审批', version: 1, status: 'PUBLISHED', createdBy: 'SEED' },
  });
  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: commissionDefinition.id, seq: 1 } },
    update: {},
    create: { workflowDefinitionId: commissionDefinition.id, seq: 1, name: '店长审批', approverType: 'ROLE', approverRoleId: storeManagerRole.id },
  });

  // ---------- 工作流定义：HR_PAYROLL（薪资单，店长初审->平台管理员终审，与CONTRACT_SIGNING同构） ----------
  // 竞品是"最多3级"，但当前角色体系只有 SUPER_ADMIN/STORE_MANAGER 两个角色，凑3级会让
  // 同一角色重复审批两次；2级已能验证多级审批机制，见业务规则确认记录「P3人事排班薪酬启动」。
  const payrollDefinition = await prisma.workflowDefinition.upsert({
    where: { tenantId_code_version: { tenantId: tenant.id, code: 'HR_PAYROLL', version: 1 } },
    update: {},
    create: { tenantId: tenant.id, code: 'HR_PAYROLL', name: '薪资单审批', version: 1, status: 'PUBLISHED', createdBy: 'SEED' },
  });
  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: payrollDefinition.id, seq: 1 } },
    update: {},
    create: { workflowDefinitionId: payrollDefinition.id, seq: 1, name: '店长初审', approverType: 'ROLE', approverRoleId: storeManagerRole.id },
  });
  await prisma.workflowNode.upsert({
    where: { workflowDefinitionId_seq: { workflowDefinitionId: payrollDefinition.id, seq: 2 } },
    update: {},
    create: { workflowDefinitionId: payrollDefinition.id, seq: 2, name: '平台管理员终审', approverType: 'ROLE', approverRoleId: superAdminRole.id },
  });

  // ---------- 工作流定义：办公审批三种固定单据（均为单节点店长审批，见业务规则确认记录#13） ----------
  const officeDefinitions: { code: string; name: string }[] = [
    { code: 'OFFICE_LEAVE', name: '请假申请审批' },
    { code: 'OFFICE_EXPENSE', name: '报销申请审批' },
    { code: 'OFFICE_MEMO', name: '日常签呈审批' },
  ];
  for (const { code, name } of officeDefinitions) {
    const definition = await prisma.workflowDefinition.upsert({
      where: { tenantId_code_version: { tenantId: tenant.id, code, version: 1 } },
      update: {},
      create: { tenantId: tenant.id, code, name, version: 1, status: 'PUBLISHED', createdBy: 'SEED' },
    });
    await prisma.workflowNode.upsert({
      where: { workflowDefinitionId_seq: { workflowDefinitionId: definition.id, seq: 1 } },
      update: {},
      create: { workflowDefinitionId: definition.id, seq: 1, name: '店长审批', approverType: 'ROLE', approverRoleId: storeManagerRole.id },
    });
  }

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

  let demoContract = await prisma.contract.findFirst({
    where: { tenantId: tenant.id, customerId: demoCustomer.id },
  });
  if (!demoContract) {
    demoContract = await prisma.contract.create({
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

  // ---------- 房态预订示例数据 ----------
  const standardRoomType = await prisma.roomType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STANDARD' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'STANDARD',
      name: '标准房',
      standardPrice: 60000,
      createdBy: 'SEED',
    },
  });
  const suiteRoomType = await prisma.roomType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SUITE' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'SUITE',
      name: '套房',
      standardPrice: 98000,
      createdBy: 'SEED',
    },
  });

  const roomSeeds = [
    { roomNo: '201', floor: '2F', roomTypeId: standardRoomType.id },
    { roomNo: '202', floor: '2F', roomTypeId: standardRoomType.id },
    { roomNo: '301', floor: '3F', roomTypeId: suiteRoomType.id },
  ];
  const demoRooms: Awaited<ReturnType<typeof prisma.room.upsert>>[] = [];
  for (const r of roomSeeds) {
    const room = await prisma.room.upsert({
      where: { tenantId_storeId_roomNo: { tenantId: tenant.id, storeId: store.id, roomNo: r.roomNo } },
      update: {},
      create: {
        tenantId: tenant.id,
        storeId: store.id,
        roomTypeId: r.roomTypeId,
        roomNo: r.roomNo,
        floor: r.floor,
        createdBy: 'SEED',
      },
    });
    demoRooms.push(room);
  }

  const demoOccupancy = await prisma.roomOccupancy.findFirst({
    where: { tenantId: tenant.id, customerId: demoCustomer.id },
  });
  if (!demoOccupancy) {
    await prisma.roomOccupancy.create({
      data: {
        tenantId: tenant.id,
        occupancyNo: generateBusinessNo('RO'),
        roomId: demoRooms[0].id,
        storeId: store.id,
        customerId: demoCustomer.id,
        // contractId 留空——验证"占用记录不要求先有生效合同"
        plannedCheckIn: new Date(),
        plannedCheckOut: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'RESERVED',
        createdBy: 'SEED',
      },
    });
  }

  // ---------- 收款示例数据 ----------
  const demoPayment = await prisma.payment.findFirst({
    where: { tenantId: tenant.id, contractId: demoContract.id },
  });
  if (!demoPayment) {
    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        paymentNo: generateBusinessNo('PY'),
        contractId: demoContract.id,
        customerId: demoCustomer.id,
        storeId: store.id,
        amount: 3000000,
        method: 'CASH',
        status: 'RECORDED',
        createdBy: 'SEED',
      },
    });
  }

  console.log('seed 完成:');
  console.log(`  租户: ${tenant.code} / 门店: ${store.code} / 区域: ${region.code}`);
  console.log(`  账号: admin / store_manager（密码见 SEED_DEV_PASSWORD，默认 ${SEED_PASSWORD}）`);
  console.log(
    `  工作流定义: DEMO_APPROVAL/HR_PAYROLL（店长初审 -> 平台管理员终审）、PAYMENT_REFUND + 库存五单据 + HR_COMMISSION（均为店长审批）`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
