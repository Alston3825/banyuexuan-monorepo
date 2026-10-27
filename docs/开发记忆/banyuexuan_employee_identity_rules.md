---
name: banyuexuan-employee-identity-rules
description: 员工手机号+工号是主要识别方式、唯一规则、工号改权限、离职归档释放工号、员工信息表拖入批量开通账号（2026-10-07已实现，未提交未上服务器）
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-07T07:02:27.880Z
---

2026-10-07 用户定的员工账号规则（已实现并通过全量e2e 226项，未提交、未同步服务器）：

- 新建账号：用户名默认=手机号（可改，手机号必填）、初始密码统一 `banyuexuan`、取消邮箱字段。
- 手机号、员工工号都不能重复（Account `@@unique([tenantId, phone])`；EmployeeProfile 用 `activeEmployeeNo` 唯一）。
- 工号一旦分配，只有拥有 `hr.employee-profile.change-no` 权限的人能改（默认仅 SUPER_ADMIN；店长/员工没有）。
- 离职归档（`hr.employee-profile.archive`，店长有、员工没有）：档案只读、账号停用、`activeEmployeeNo` 置空 → 工号可回收给新员工；手机号仍属原账号。恢复在职（`restore`，仅管理员）：原工号被占就要换号。
- 员工信息表（Excel .xlsx）拖到账号管理页 → 预览（逐行检查）→ 勾选 → 开通；服务 `account-import.service.ts`，前端 `components/account/AccountImportDialog.vue`；表里没有对应字段的列（工龄等）不读。

**Why:** 用户要用员工信息表批量开通账号，手机号和工号是员工在系统里的主要识别方式。
**How to apply:** 改账号/员工档案相关逻辑时保持这些唯一性与权限；真实27人表由用户自己拖入导入，不要替用户导入到dev库；开发库已有 001闫杏/004李青 会与真实表同号冲突，导入前先看预览提示。上服务器需迁移 `20261017000000_unique_phone_releasable_employee_no` 并重跑seed（新权限）。见 [[banyuexuan-real-data-import]] [[banyuexuan-deploy-20261006]]。
