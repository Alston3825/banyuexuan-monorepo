---
name: banyuexuan-customer-form-redesign
description: 新添客户页按竞品截图重做（2026-10-05）：决策、新增字段/表/权限/路由、已知取舍；未提交未同步服务器
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-05T05:26:51.916Z
---

客户管理"新建客户"由弹窗改为整页 `/crm/customers/new`（编辑 `/crm/customers/:id/edit`），布局照竞品"新添客户（客户基本信息）"截图。2026-10-05 本地完成并通过浏览器验证 + 后端 e2e `p6-customer-form-flow`，**未 commit、未同步服务器**。

**用户已定的决策**
- 渠道 = 两级：类型（沿用原 `source` 枚举 6 类）+ 具体渠道（新主数据表 `customer_channels`，页面 `/crm/channels`，只能新增/改名/停用，不能删）。
- 推荐人：客户和员工都可选（`referrerType` CUSTOMER|ACCOUNT + `referrerId`）。
- 客户分配拆两个归属：电话销售员 `phoneSalesId`、门店销售员 `assignedToId`；**不做销售计时**。
- "提交，去购买服务" → `/contract/records?upload=1`（合同管理上传合同）。

**2026-10-05 追加改动**：①身份证第17位判男女（`checkIdCard().gender`），男性弹窗提示（同号失焦只弹一次，点验证按钮每次弹）；②渠道类型改为可自定义——新表 `customer_channel_types`（迁移 `20261006000000`，6 个内置类型带 `legacySource`，不可删，可改名/停用；自定义类型无 legacySource、`Customer.source` 记 OTHER），Customer 新增 `channelTypeId`，具体渠道 `sourceType`→`typeId`；类型/渠道都能增改停删（被客户用过的不能删）；seed 里 upsert 内置类型；线索 Lead 仍用旧枚举 source，未跟着自定义（线索转客户时换算成内置类型）；③片区提示改"锦业路商圈、大都荟商圈"，"(与妈妈)关系"→"(与产妇)关系"。

**新增字段（Customer）**：birthday（身份证自动算）、zone（片区，自由文本）、hisNo、passportNo、registeredAt（添加时间）、ccAccountIds（抄送人，Json）、channelId、referrerType/Id、phoneSalesId。迁移 `20261005000000_customer_form_fields`。
**新增权限点**：`crm.channel(.view/.create/.update)`，create/update 店长不给（仅超管）；老登录会话要重新登录才生效。
**手机号查重**：同号 409；"再次入住妈妈，允许号码重复"勾选后放行（合同上传自动建客户走 allowDuplicatePhone）。"待补充"占位手机号是真实数据里的常见值。

**已知取舍/没做**
- 抄送人只记录并在详情展示，系统暂无站内通知。
- "身份证读卡快录"按钮禁用（需硬件）。
- 片区是自由文本，建档门店保留（创建时可选）。
- 简拼搜索用 pinyin-pro；推荐人搜索对英文关键词会全量扫客户表（1000 级可接受）。

**Why:** 用户要求按竞品页面设计并把每个字段对应到系统数据。
**How to apply:** 后续动客户表单/渠道/合同自动建客户时，注意上述 DTO "null=清空，undefined=不改" 语义；同步服务器需带 3 个新迁移（20260921/20260922/20261005）+ 新权限点 seed。参见 [[banyuexuan-contract-redesign]]、[[banyuexuan-project-status]]。
