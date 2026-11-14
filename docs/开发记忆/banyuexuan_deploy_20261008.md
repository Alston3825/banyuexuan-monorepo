---
name: banyuexuan-deploy-20261008
description: 2026-10-08 上线（岗位默认权限清单+恢复默认权限、预订冲突协调、设置权限“网络请求失败”修复）；线上权限数据由用户手动调整；权限类脚本会被拦截
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-08T13:34:53.648Z
---

2026-10-08 用户说"上线"后部署了 main `9e51b4d`（默认权限清单 `apps/api/src/platform/role/role-defaults.ts` + 角色管理"恢复默认权限"按钮 + 新角色护理长 NURSE_LEAD/护理师 NURSE + 预订冲突协调），随后 `8be4595`（角色列表瘦身、权限保存排队+断网重试、nginx gzip、默认权限对比只看 BUTTON 级）。验证：health ok、新路由未登录 401、gzip 生效、API 日志无错误；登录后功能点测未做（规则）。

**线上数据**：我想写脚本直接改线上权限（部门负责人恢复默认、给张军花分配护理长）被系统权限拦截两次，用户自己在界面上点了"恢复默认权限"，之后又手动给部门负责人加了权限（嫌 21 项太少）——线上这个角色已不等于默认清单。**How to apply**：不要再点/调用"恢复默认权限"覆盖它；想对齐默认清单需先只读查线上实际权限再改 role-defaults.ts（已向用户提议，等回复）。张军花是否已分配护理长未核实。
**Why**：种子/发版只补不删，不会覆盖用户手调的权限。
**踩坑**：ssh 里用 `pgrep -f scripts/deploy.sh` 会匹配到自己的 ssh 命令导致永远"running"，改看日志末尾"部署完成"。部署前用 `sudo bash scripts/backup-mysql.sh` 手动备份。线上改权限/发版没有用户明确"上线"会被拦。

关联：[[banyuexuan-deploy-20261007]] [[banyuexuan-server-access]]

**后续（同日）**：部门负责人默认权限改为用户线上手调的版本再去掉敏感项（薪资操作/员工归档改工号/强制删除/删房间/流程设置修改/知识库删除，保留审核护理计划，共158项，`7ca8654`导航合并"系统管理"、`ac8eb17`默认权限）；`30a1e6c` 上线客户/母婴档案删除与归档（迁移 20261020 加 customers/mother_profiles 归档列，权限 crm.customer.archive/delete，规则：空壳可删、录入资料管理员输姓名连同删、用过的只能归档可恢复，无回收站，无合并客户）。验证：迁移列在、权限点在、新路由401、日志无错。注意：ctx.hasPermission 是 async，必须 await（我曾漏写，测试抓到）；prisma migrate reset 会被拦，需用户明确同意。

**2026-10-09 待办交接**：本地已提交未上线 `31f15a4`（main.ts：新版 Service Worker 接管时自动刷新一次，输入框有焦点时不刷）。用户反馈重新登录后看不到"归档/删除"按钮——服务器核实过：线上 bundle 含按钮、admin 有权限；原因是浏览器 PWA 缓存旧页面，已让用户 Cmd+Shift+R 两次，等用户确认后再说"上线"部署 31f15a4。线上未分配护理长/护理师给任何人，张军花是否已有护理长未核实。待用户确认：薪资查看权限是否也从部门负责人默认里去掉；是否需要回收站/合并客户（已记待完善清单 D1-D3）；测试库残留数据致 p6-contract 3 项失败需用户同意才能 migrate reset。
