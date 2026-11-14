---
name: banyuexuan-deploy-20261007
description: 2026-10-07 第二次上线（账号导入/审批中心/采购全流程/护理签字等）的结果和验证方式；新岗位角色上线后还没分配给任何人
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-07T11:40:43.762Z
---

2026-10-07 用户明确说"上线到服务器，并检测功能是否正常"，已提交（GitHub main `3469110`）并部署：迁移 20261015~20261019 全部成功，seed 加了新权限（共 411 条）和 3 个新角色（部门负责人 DEPT_HEAD / 客服 CUSTOMER_SERVICE / 采购员 PURCHASER）。部署前备份：服务器 `~/banyuexuan/backups/banyuexuan_prod-20261007-193658.sql.gz`。服务器数据当时几乎是空的（2 个账号），无迁移冲突。

**验证做了**：health ok、错误密码 401、新接口未登录均 401（说明路由存在）、手机尺寸登录页正常、DB 迁移/角色/权限/列都在、API 日志无错误。**没做**：登录后的功能点测（规则禁止代输生产管理员密码、也不在生产建测试账号），本机同一份代码全量 e2e 242 项通过；请用户自己登录点一遍。

**未做/待用户**：服务器上还没有员工账号（本机导入的 22 人没上传），需要用户在服务器上拖入员工信息表开通，并在“账号管理→角色分配”里把 部门负责人/客服/采购员 角色分给对应员工（范围选门店级）。

关联：[[banyuexuan-deploy-20261006]] [[banyuexuan-employee-identity-rules]] [[banyuexuan-workflow-center]]
