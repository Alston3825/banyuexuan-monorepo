---
name: banyuexuan-workflow-center
description: 审批中心/我的待办/审批流程设置（2026-10-07已实现，未提交未上服务器）、审批人解析规则、之前申购单审批卡死的原因
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-07T08:39:23.812Z
---

2026-10-07 实现（本机已验证，全量e2e 233项通过；未提交、未同步服务器）：

- 审批进度组件 `components/workflow/ApprovalProgress.vue`：每步谁在审/等多久/超时/意见；待审批人出现通过/驳回/转交/加签/抄送，发起人催办/撤回，管理员“重新指定审批人”。申购单详情已内嵌；其它单据点“审批进度”跳 `/workflow/instances/:id`。
- 我的待办 `/workspace/todos` + 顶栏铃铛（60秒刷新，登录弹一次提醒）：待审批（带时限/超时/被催办）、被驳回、员工证件合同到期、离店回访任务。接口 `GET /workspace/todos`。
- 审批中心 `/workflow/approvals`（待我审批/我发起的/我已处理/抄送我的）。
- 审批流程设置 `/workflow/settings`（权限 `workflow.definition.view/update`，默认仅管理员）：多级、会签/或签、每级处理时限(timeoutHours)、启停；改流程=新版本，在途单据按旧版走完。迁移 `20261018000000_workflow_node_mode_timeout`。
- 审批人解析：只取在职账号；按单据门店范围优先（全局/本店/本区域角色分配），无则退回全部；第一节点无人时提交直接报错；后续节点无人自动跳过。

**Why:** 用户提交申购单后看不到审批进度、店长没有同意按钮——根因是审批被派给了已停用的演示账号 store_manager（而店长闫杏当时也被停用），单据卡死且界面没有任何审批入口。
**How to apply:** 新接入审批的业务模块要在 `workflow-business.ts` 登记类型名；上服务器需迁移+重跑seed（新权限）；旧的“另一门店店长也要批”的测试预期已改。见 [[banyuexuan-employee-identity-rules]] [[banyuexuan-deploy-20261006]]。
