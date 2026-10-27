---
name: banyuexuan-deploy-20261006
description: "2026-10-06 首次把\"合同纸质台账/护理档案/员工档案/申购单\"等大批改动部署到腾讯云生产服务器的结果、踩坑和以后发版流程"
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-06T14:52:27.126Z
---

2026-10-06 用户明确说"把所有内容上传至服务器"，已提交并部署（GitHub main `4817057`，服务器代码 `bdd53fc` 起，之后只有 docs 提交）。服务器 DB 当时基本是空的（0 合同/1 示例客户/2 账号），所以破坏性迁移（删合同模板表）没丢数据；部署前仍备份了 DB。**本机 dev 库里的真实客户/入住数据没有上传。**

**以后发版流程**：本机 commit → `git push origin HEAD:main`（需先 `git merge origin/main`）→ 服务器 `git pull origin main && sudo bash scripts/deploy.sh`（后台跑，日志重定向到 ~/deploy-xxx.log，用 Monitor 等；构建约 5~8 分钟，失败时旧容器不受影响）。

**踩过的坑（别再踩）**
- 服务器 Docker 构建用 `vue-tsc -b`（严格，含未使用变量），本机用 `vue-tsc --noEmit` 查不出；本地发版前要跑 `cd apps/web && npx vue-tsc -b`（否则 deploy 在 web 构建阶段中断）。
- 宿主机 nginx 实际生效的是 `/etc/nginx/sites-enabled/banyuexuan.conf`（普通文件，不是指向 sites-available 的软链）；改 sites-available 无效。已在生效文件里加 `client_max_body_size 50m` + `proxy_read_timeout 300s`（默认 1MB 会让手机照片上传报 413）。备份 `/etc/nginx/banyuexuan.enabled.bak-20261006`。该文件里还有用户自己的 `/insurance-reports/` 站点，别删。
- 照片/合同原件在容器 `/repo/apps/api/storage`，已加命名卷 `banyuexuan-prod_api_storage`；`backup-mysql.sh` 每日同时打包 files-*.tar.gz。
- 验证上线用：`curl https://fanqieai.cc/api/v1/health`、错误密码登录应 401、大文件未登录 POST 应 401（413 说明 nginx 拦了）、手机尺寸看登录页。**不要用生产管理员密码去做登录测试**（规则禁止代输生产密码），请用户自己登录确认。

**AI 密钥（2026-10-06 已处理）**：用户明确同意后，已把本机 `apps/ai-service/.env` 里的 `VOLCENGINE_PLAN_API_KEY/BASE_URL/MODEL` 经 ssh 标准输入写进服务器 `.env.prod`（600 权限，不出现在命令行/日志），重建 ai-service 后实测服务器连通火山引擎。用户说"后期有空再修改"——**后期要换成方舟按量计费密钥**（Agent Plan 是编程工具套餐，长期生产用有合规风险），换法见 docs/待完善清单.md 的 E2。

关联：[[banyuexuan-server-access]] · [[banyuexuan-todo-list-rule]]
