---
name: banyuexuan-server-access
description: 伴月轩项目腾讯云生产服务器的SSH登录方式（当前私钥路径、登录用户、主机指纹），部署/远程操作时用
metadata:
  node_type: memory
  type: reference
  modified: 2026-10-05T03:54:12.902Z
  originSessionId: f40148f1-1785-496d-a23c-dee0428a1d5a
---

腾讯云生产服务器（fanqieai.cc，IP 150.158.182.205）的登录方式：

- 当前私钥（RSA PEM）：`/Users/alston/Desktop/百度同步盘/AI 密匙/fanqieai1004.pem`（2026-10-05 用户换的新钥匙，权限已是600，已实测 ubuntu 登录成功，主机名 VM-0-12-ubuntu，主机指纹没变）
- 登录用户：`ubuntu`（`root` 用密钥登录会被拒绝）。命令示例：`ssh -i "<上面路径>" -o IdentitiesOnly=yes ubuntu@fanqieai.cc`
- 上一把（2026-09-20）：`/Users/alston/Desktop/桌面 - Alston的MacBook Pro/同步空间/伴月轩AI系统开发/fanqieai.pem`，已被 fanqieai1004.pem 取代，不要再用。
- 服务器重置后的主机指纹（首次连接已记入本机 known_hosts）：ED25519 `SHA256:lNQ+a4x8QNPxxyjBuItDvWFp21isbnwwiu+qd5mvLkg`

**Why**：用户会不定期重置/更换密钥，每次都要按最新的文件路径和用户名来连，别凭旧记忆。
**How to apply**：
- 需要 `ssh -i` 连服务器或跑部署脚本时，用上面的路径；私钥文件权限必须是 `600`（这把新文件用户放进来时是 `644`，SSH 会拒绝，已改过；以后用户再替换文件，先 `ls -l` 检查权限）。
- 旧的 `/Users/alston/Desktop/桌面 - Alston的MacBook Pro/banyuexuan.pem` 是重置前的旧钥匙，已失效，不要再用。`/Users/alston/Downloads/ubuntu .pem` 更早、疑似废弃，同样别用。
- 如果以后 SSH 报"REMOTE HOST IDENTIFICATION HAS CHANGED"，说明服务器又重置了，先问用户，别自动清 known_hosts。
- 私钥内容不要写进记忆或文档，只记路径。
- 用户明确说"同步到服务器"之前，只做连通性验证，不部署。

**服务器现状（2026-09-20 只读查看）**：代码在 `~/banyuexuan`（git，origin=GitHub `Alston3825/banyuexuan-monorepo`，当前 main `77bde92`，最后部署 2026-08-17），发布方式=服务器上 `git pull origin main` + `sudo bash scripts/deploy.sh`（幂等，会跑迁移+seed）；ubuntu 用户需 `sudo docker`（直接 docker 报 permission denied）；ubuntu 有免密 sudo；HTTPS 域名 fanqieai.cc 已配好；每天凌晨3点备份到 `~/banyuexuan/backups/`。本机 9/19 以来 ~130 个文件的改动都未提交未推送，要同步必须先 commit→合入 main→push（用户说"同步"才做；本机 main 被另一个 worktree 占用，可直接 `git push origin HEAD:main`，前提是先把 origin/main 合入当前分支）。**2026-09-20 用户曾说"同步到服务器"，我刚开始做检查他就叫停，改为"先在本地做好改动和测试"——所以别自作主张，等他再次明确说。**同步时别忘了：服务器 `.env.prod` 里 ai-service 要配 VOLCENGINE_PLAN_* 才有 AI（要先问用户是否把密钥放上去，并提醒 Agent Plan 的用途风险）；不要把本机导入的真实房态数据灌上去。

参见 [[banyuexuan-project-status]] 里的部署相关章节（`docs/部署操作手册.md`/`docs/环境与密钥管理手册.md`）。
