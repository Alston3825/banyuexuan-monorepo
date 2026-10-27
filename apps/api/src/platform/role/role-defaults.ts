/**
 * 各岗位角色的「默认权限清单」——唯一来源。
 * - 种子（prisma/seed.ts）建库/升级时用它创建角色并补齐权限（只补不删，不会动管理员后来手工加的权限）；
 * - 「角色管理 → 恢复默认权限」按钮用它把某个角色一键还原成这份清单（会撤销多余的权限，管理员手工操作）。
 * 想调整某个岗位的默认权限，只改这个文件，再发版即可。
 */

export interface RoleDefault {
  code: string;
  name: string;
  description: string;
  /** 明确列出的权限点；末尾 `.*` 表示这一类全部动作（如 ai.care-abnormality-agent.* ）。 */
  perms?: string[];
  /** 按规则从全部权限点推导（店长/普通员工沿用的前缀规则）。 */
  derive?: (allCodes: string[]) => string[];
}

// 每个员工都需要的“自助”权限：请假/报销/签呈（自己提交、查看进度、撤回）、我的考试、看自己的审批进度
const SELF_SERVICE = [
  'office.leave-request.view', 'office.leave-request.create', 'office.leave-request.submit', 'office.leave-request.cancel',
  'office.expense-claim.view', 'office.expense-claim.create', 'office.expense-claim.submit', 'office.expense-claim.cancel',
  'office.general-memo.view', 'office.general-memo.create', 'office.general-memo.submit', 'office.general-memo.cancel',
  'training.exam-attempt.view', 'training.exam-attempt.submit',
  'workflow.instance.view',
];

// 部门申购单（部门负责人/护理长等“填单人”）
const PURCHASE_REQUEST_FILL = [
  'inventory.purchase-request.view', 'inventory.purchase-request.create', 'inventory.purchase-request.update',
  'inventory.purchase-request.submit', 'inventory.purchase-request.cancel',
  'inventory.item.view',
];

// 护理日常工作：看板、档案（查看/新建/修改，不含“审核护理计划”和“强制删除”）、计划、记录、异常、离店关怀
const CARE_DAILY = [
  'care.board.view',
  'care.profile.view', 'care.profile.create', 'care.profile.update',
  'care.plan.view', 'care.plan.create', 'care.plan.terminate',
  'care.record.view', 'care.record.create',
  'care.abnormality.view', 'care.abnormality.follow-up', 'care.abnormality.resolve', 'care.abnormality.ignore',
  'care.outreach-plan.view', 'care.outreach-plan.create', 'care.outreach-plan.complete-task', 'care.outreach-plan.terminate',
  'meal.diner-profile.view', 'meal.record.view',
  'room.room.view', 'room.occupancy.view',
];

export const DEFAULT_ROLES: RoleDefault[] = [
  {
    code: 'STORE_MANAGER',
    name: '店长',
    description: '门店日常管理与一级审批，无账号手机号查看权限、无门店删除权限',
    derive: storeManagerCodes,
  },
  {
    code: 'STORE_STAFF',
    name: '普通员工',
    description: '门店一线日常业务操作，不含经营分析/设备网关/账号权限/组织架构/基础资料/审计日志',
    derive: storeStaffCodes,
  },
  {
    // 2026-10-08 起采用管理员在线上手动调好的这一套（共 170 项，按模块列出）：
    // 部门负责人要同时管本部门的护理/餐饮/房态/库存/人事/办公等日常事务，所以权限较宽；
    // 仍然不含账号、角色、组织架构、审计日志等“平台管理”权限。
    code: 'DEPT_HEAD',
    name: '部门负责人',
    description: '部门日常管理：本部门申购、护理/月子餐/房态/产康/库存/人事/合同/办公审批等业务；不含账号、角色、组织架构、审计日志',
    perms: [
    'ai.business-analytics-agent.analyze',
    'ai.care-abnormality-agent.suggest',
    'ai.knowledge-document.create', 'ai.knowledge-document.update', 'ai.knowledge-document.view',
    'analytics.dashboard.view',
    'care.abnormality.follow-up', 'care.abnormality.ignore', 'care.abnormality.resolve', 'care.abnormality.view',
    'care.board.view',
    'care.outreach-plan.complete-task', 'care.outreach-plan.create', 'care.outreach-plan.terminate', 'care.outreach-plan.view',
    'care.plan.create', 'care.plan.terminate', 'care.plan.view',
    'care.profile.approve', 'care.profile.create', 'care.profile.update', 'care.profile.view',
    'care.record.create', 'care.record.view',
    // 合同模块改成纸质合同台账后，创建/续签/签署/提交/模板这些旧权限点已经不存在，只保留现有的
    'contract.record.confirm', 'contract.record.delete', 'contract.record.update', 'contract.record.upload', 'contract.record.view', 'contract.record.void',
    'hr.commission-record.cancel', 'hr.commission-record.create', 'hr.commission-record.submit', 'hr.commission-record.view',
    'hr.employee-profile.create', 'hr.employee-profile.update', 'hr.employee-profile.view',
    'hr.payroll-record.view',
    'hr.schedule-entry.create', 'hr.schedule-entry.delete', 'hr.schedule-entry.update', 'hr.schedule-entry.view',
    'hr.shift-definition.create', 'hr.shift-definition.update', 'hr.shift-definition.view',
    'inventory.goods-receipt.cancel', 'inventory.goods-receipt.create', 'inventory.goods-receipt.execute', 'inventory.goods-receipt.receive', 'inventory.goods-receipt.submit', 'inventory.goods-receipt.view',
    'inventory.item.view',
    'inventory.purchase-order.cancel', 'inventory.purchase-order.create', 'inventory.purchase-order.purchase', 'inventory.purchase-order.submit', 'inventory.purchase-order.view',
    'inventory.purchase-request.cancel', 'inventory.purchase-request.create', 'inventory.purchase-request.submit', 'inventory.purchase-request.update', 'inventory.purchase-request.view',
    'inventory.warehouse-stock.view',
    'logistics.utility-expense.create', 'logistics.utility-expense.update', 'logistics.utility-expense.view',
    'logistics.vehicle.create', 'logistics.vehicle.update', 'logistics.vehicle.view',
    'logistics.vehicle-booking.cancel', 'logistics.vehicle-booking.create', 'logistics.vehicle-booking.view',
    'meal.dietary-restriction.create', 'meal.dietary-restriction.update', 'meal.dietary-restriction.view',
    'meal.diner-profile.create', 'meal.diner-profile.end', 'meal.diner-profile.view',
    'meal.item.create', 'meal.item.update', 'meal.item.view',
    'meal.plan-template.create', 'meal.plan-template.update', 'meal.plan-template.view',
    'meal.record.feedback', 'meal.record.select', 'meal.record.serve', 'meal.record.view',
    'office.expense-claim.cancel', 'office.expense-claim.create', 'office.expense-claim.submit', 'office.expense-claim.view',
    'office.general-memo.cancel', 'office.general-memo.create', 'office.general-memo.submit', 'office.general-memo.view',
    'office.leave-request.cancel', 'office.leave-request.create', 'office.leave-request.submit', 'office.leave-request.view',
    'room.call.create', 'room.call.handle', 'room.call.view',
    'room.occupancy.cancel', 'room.occupancy.checkin', 'room.occupancy.checkout', 'room.occupancy.create', 'room.occupancy.reschedule', 'room.occupancy.view',
    'room.outing.cancel', 'room.outing.checkback', 'room.outing.checkout', 'room.outing.create', 'room.outing.view',
    'room.room.clean', 'room.room.create', 'room.room.maintenance', 'room.room.update', 'room.room.view',
    'room.service-requisition.create', 'room.service-requisition.fulfill', 'room.service-requisition.view',
    'room.type.create', 'room.type.update', 'room.type.view',
    'service.appointment.cancel', 'service.appointment.complete', 'service.appointment.create', 'service.appointment.feedback', 'service.appointment.view',
    'service.customer-package.create', 'service.customer-package.view',
    'service.package.create', 'service.package.update', 'service.package.view',
    'service.product.create', 'service.product.update', 'service.product.view',
    'service.therapist.create', 'service.therapist.update', 'service.therapist.view',
    'training.exam.create', 'training.exam.update', 'training.exam.view',
    'training.exam-attempt.grade', 'training.exam-attempt.submit', 'training.exam-attempt.view',
    'workflow.definition.view',
    'workflow.demo-approval.create', 'workflow.demo-approval.view',
    'workflow.instance.add-approver', 'workflow.instance.approve', 'workflow.instance.archive', 'workflow.instance.cc', 'workflow.instance.reassign', 'workflow.instance.reject', 'workflow.instance.view', 'workflow.instance.withdraw',
    ],
  },
  {
    // 护理长 = 部门负责人（可填申购单）+ 护理日常工作 + 护理部排班；审核护理计划只给店长/护理主任
    code: 'NURSE_LEAD',
    name: '护理长',
    description: '护理部日常管理：护理档案/计划/记录/异常/离店关怀、护理部排班、填写护理部申购单；不含审核护理计划',
    perms: [
      ...CARE_DAILY, ...PURCHASE_REQUEST_FILL, ...SELF_SERVICE,
      'care.growth.edit',
      'hr.shift-definition.view', 'hr.schedule-entry.view', 'hr.schedule-entry.create', 'hr.schedule-entry.update', 'hr.schedule-entry.delete',
      'ai.care-abnormality-agent.*',
    ],
  },
  {
    // 一线护理师：看档案、做每日护理记录、看异常；不能建档、不能终止计划
    code: 'NURSE',
    name: '护理师',
    description: '一线护理：查看母婴档案与护理计划、填写日常护理记录、查看异常提醒',
    perms: [
      'care.board.view', 'care.profile.view', 'care.plan.view', 'care.record.view', 'care.record.create', 'care.abnormality.view',
      'meal.diner-profile.view', 'meal.record.view', 'room.room.view', 'room.occupancy.view',
      ...SELF_SERVICE,
    ],
  },
  {
    code: 'CUSTOMER_SERVICE',
    name: '客服',
    description: '汇总各部门申购单并提交店长审批；货到后逐项确认收货、入库',
    perms: [
      'inventory.purchase-request.view', 'inventory.purchase-request.create', 'inventory.purchase-request.update', 'inventory.purchase-request.submit', 'inventory.purchase-request.cancel', 'inventory.purchase-request.convert', 'inventory.purchase-request.collect',
      'inventory.purchase-order.view', 'inventory.goods-receipt.view', 'inventory.goods-receipt.receive',
      'inventory.item.view', 'inventory.warehouse.view', 'inventory.supplier.view', 'inventory.warehouse-stock.view',
      ...SELF_SERVICE,
    ],
  },
  {
    code: 'PURCHASER',
    name: '采购员',
    description: '收到店长批准的申购单后生成采购单、去采购，采购完点“确认采购”',
    perms: [
      'inventory.purchase-request.view', 'inventory.purchase-request.convert',
      'inventory.purchase-order.view', 'inventory.purchase-order.create', 'inventory.purchase-order.purchase', 'inventory.purchase-order.cancel',
      'inventory.goods-receipt.view',
      'inventory.supplier.view', 'inventory.supplier.create', 'inventory.supplier.update', 'inventory.item.view', 'inventory.warehouse.view',
      ...SELF_SERVICE,
    ],
  },
];

/** 某个角色的默认权限点编码（按当前权限目录 allCodes 展开通配/推导）；没有默认清单的角色返回 undefined。 */
export function resolveDefaultCodes(roleCode: string, allCodes: string[]): string[] | undefined {
  const def = DEFAULT_ROLES.find((r) => r.code === roleCode);
  if (!def) return undefined;
  if (def.derive) return def.derive(allCodes);
  const all = new Set(allCodes);
  const out = new Set<string>();
  for (const p of def.perms ?? []) {
    if (p.endsWith('.*')) {
      const base = p.slice(0, -2);
      for (const c of allCodes) if (c.startsWith(`${base}.`)) out.add(c);
    } else if (all.has(p)) {
      out.add(p);
    }
  }
  return [...out];
}

function storeManagerCodes(allCodes: string[]): string[] {
  // STORE_MANAGER：有意缺 platform.store.delete，用于验证 403；
  // CRM 的 lose（线索/机会标记流失）、合同的 void（作废）同理有意缺失——影响统计口径/具有终局性的
  // 操作先只给 SUPER_ADMIN。合同模板（法律文本主数据）也不开放给 STORE_MANAGER，与 Parameter/Tag/Region
  // 这类主数据现在的处理口径一致。房型（room.type）同理是平台级主数据，不开放给 STORE_MANAGER；
  // 房间与占用记录（room.room / room.occupancy）是前台/店长的日常操作，全部动作开放，不额外排除；
  // 唯一例外是 room.room.force-delete（删除已有预订/入住记录的房间），会连带清掉历史占用记录，只留给 SUPER_ADMIN。
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
  // 培训与考核：试卷管理(training.exam)是总部统一培训标准，同room.type/care.field口径不开放
  // 给STORE_MANAGER；我的考试(training.exam-attempt，含参加考试/查看自己成绩/批阅简答题)是
  // 员工日常操作+店长审核自己门店员工的操作，全部动作开放。
  // 离店后关怀跟踪：关怀模板(care.outreach-template)是总部统一制定的运营标准，同
  // care.plan-template口径不开放给STORE_MANAGER；生成计划/查看/终止/完成任务
  // (care.outreach-plan，含complete-task)是店长/护理人员日常跟进自己门店客户的操作，
  // 全部动作开放。
  const storeManagerExcluded = new Set([
    'crm.channel.create',
    'crm.channel.update',
    'crm.customer.delete', // 删除客户只给超级管理员；店长只能归档
    'crm.customer.force-delete', // 连同合同/收款等一并删除：只给超级管理员
    'crm.customer.restore', // 回收站（还原/彻底删除）：只给超级管理员
    'platform.store.delete',
    'room.room.force-delete',
    'care.profile.force-delete',
    'hr.employee-profile.change-no',
    'hr.employee-profile.restore',
    'crm.lead.lose',
    'crm.opportunity.lose',
    'contract.record.void',
    'finance.customer-account.adjust',
    'logistics.vehicle.create',
    'logistics.vehicle.update',
    'iot.device-type.create',
    'iot.device-type.update',
  ]);
  const codes = allCodes
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
          code.startsWith('care.board') ||
          code.startsWith('care.profile') ||
          code.startsWith('care.growth') ||
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
          code.startsWith('inventory.purchase-request') ||
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
          code.startsWith('analytics.dashboard') ||
          code.startsWith('training.exam-attempt') ||
          code.startsWith('care.outreach-plan')),
    );
  return codes;
}

function storeStaffCodes(allCodes: string[]): string[] {
  const storeManagerCodes_ = storeManagerCodes(allCodes);

  // 普通员工 = 店长能操作的日常业务权限，刨掉四块"管理侧"配置（组织架构/账号权限/
  // 基础资料统一在 platform 这一个MODULE code下面，见 nav-menu.ts 里对这三个导航分组
  // 共用同一个后端module的说明；审计日志audit；经营分析analytics；设备网关iot）。
  // 另外"删除房间"(room.room.delete)是不可逆操作，只给店长/管理员，普通员工不开放。
  const storeStaffExcluded = new Set(['care.growth.edit', 'room.room.delete', 'care.profile.approve', 'hr.employee-profile.archive', 'crm.customer.archive', 'crm.customer.merge', 'hr.payroll-record.view-all']); // 审核护理计划只给店长/护理主任
  return storeManagerCodes_.filter(
    (code) =>
      !storeStaffExcluded.has(code) &&
      !code.startsWith('platform') &&
      !code.startsWith('audit') &&
      !code.startsWith('analytics') &&
      !code.startsWith('iot'),
  );
}
