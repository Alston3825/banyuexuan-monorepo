---
name: banyuexuan-working-style
description: 与用户协作开发伴月轩项目时的方法论与经验教训——先本地验收再部署、模块打包测试、commit时机
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a34a6ed3-7f0f-4098-b290-45e81afd5d76
  modified: 2026-09-22T22:31:30.357Z
---

- **开发节奏**：每个功能模块先在本地开发环境完成编码与数据录入测试，用户确认没问题后再部署到腾讯云服务器；下一个模块开发前不强制要求上一个模块"完全独立测试完毕"——因为模块间数据天然关联（客户→合同→收款→房态互相引用），完整的端到端验收只能在一组关联模块都写完后一次性做（这正是《软件项目开发计划》把P1定义为"客户+合同+房态+收款"打包一期的原因）。用户对这个方法论有清晰认知并主动确认过。
  **How to apply**：不要试图让每个模块在完全隔离状态下做"完整业务闭环"验收；单个模块写完时只做该模块自身的基础自测（可用手工造的最小依赖数据），跨模块的端到端集成测试留到这一组模块（对应开发计划里的一个阶段，如P1/P2/P3）收尾时一次性补上。

- **Git提交**：只有用户明确说"提交"/"commit"才创建commit，绝不主动提交。仓库现有commit风格是"P0/P1 前端/后端：XX模块"这种中文标题+项目对应阶段编号，正文用要点列出改动内容。docs类分析文档和实际代码改动倾向拆成不同commit（分析文档一个commit，功能代码+测试+bug修复+体验优化打包一个commit），除非改动量很小。

- **浏览器自动化测试的一个坑**：用 Claude_Browser 工具测试 Naive UI 的可搜索下拉框（n-select filterable + 弹层）时，会反复出现"选中后又被清空"或"点击后弹层重新打开"的现象——这是这个浏览器自动化工具本身跟悬浮组件的点击时序问题，**不是应用代码的bug**（已让用户手动操作同一个下拉框验证过，用户操作完全正常）。以后再遇到类似现象，不要花太多轮次去"修复"代码，先怀疑是自动化工具的问题，可以请用户手动点一下确认。
  **补充(2026-07-30)**：同样的坑也出现在 n-select 的虚拟滚动列表（选项数量多时触发虚拟化）和 n-date-picker 的 daterange 弹层上——鼠标点击弹层里的选项/日期格子经常不生效或状态错乱。两个可行的绕过办法，按优先级尝试：①**直接往输入框里 type 文字**（select 用 filterable 输入过滤文字；date-picker 直接 type "2026-07-01" 这种日期字符串再按 Tab/Enter）通常最可靠；②如果必须点弹层里的选项，用 `javascript_tool` 找到目标 DOM 元素后 `.click()`（配合 `mousedown`/`mouseup`/`click` 三个事件一起 dispatch）比用 `computer` 工具算像素坐标点击更可靠，尤其是虚拟滚动列表（用 `document.querySelectorAll` 按 `textContent` 找目标元素，而不是猜坐标）。这类组件在其他页面（如 VehicleBookingsView 的 n-date-picker）已经是生产验证过的写法，遇到自动化点不动时不要怀疑组件代码本身。

- **Jest e2e 套件跑完后不会自动退出**：`cd apps/api && npx jest --config test/jest-e2e.json` 全量跑完后会卡在 "Jest did not exit one second after the test run..."，如果命令后面接了 `| tail` 这类需要等待进程 EOF 才能输出的管道，会导致整条命令看起来像卡死（实际上测试早就跑完了，只是 shell 在等一个不会来的 EOF），曾经因此误判成"死循环bug"排查了很久。**固定加 `--forceExit` 参数**（`npx jest --config test/jest-e2e.json --runInBand --forceExit`），并且不要用 `| tail` 包这条命令，直接看完整输出或用 `run_in_background` + Read 输出文件。

- **代码/远程仓库现状**：截至2026-07-28，P0+P1的全部工作只在本地分支 `claude/postpartum-center-software-analysis-c2dfdd`，未push到GitHub远程、未合并main（详见 [[banyuexuan-project-status]]）。用户曾表示这些代码"不重要/可以重来"，但这是在P1收尾工作完成前的表态，后续又有增量工作——新会话里涉及是否推送/合并时，应重新跟用户确认而非直接照搬旧表态。

- **每次改完都要附测试信息**（2026-08-19起）：每一次功能修改完成后，回复末尾必须附上本地测试地址+登录账号密码，方便用户直接点进去测试，不用再来问。格式：前端地址（`http://localhost:5180`）+ 账号（默认 `admin` / `change-me`，即种子数据里的超级管理员；如果测的是特定角色权限，改用对应账号如 `store_manager`/`store_staff`/`test_user`，密码同样是 `change-me` 除非另有说明）。
  **How to apply**：这是每次回复的固定收尾格式，不是"用户问了才给"——哪怕只改了一个小 bug，只要涉及本机可测试的前端改动，回复最后都加上这段。如果本机开发环境的账号密码被重置过（比如本会话中途因为数据库重置改成过 `Passw0rd!23` 又重置回 `change-me`），要以当次会话里实际验证成功登录过的那组账密为准，别凭记忆报旧值。

- **本机测试环境反复失联的根因与修复（最终版，2026-09-03）**：用户多次反馈"测试地址登录不上"。根因两层——① api/web 两个开发服务器一直是靠 Claude Code 会话里临时 `nohup npm run start:dev &` 起的后台 shell 进程撑着，会话/终端一断进程就没了；② Docker Desktop 没有随开机/登录自动启动，Mac 重启后 Docker 不会自动起来，连带 MySQL/Redis 容器（虽然容器本身配了 `restart: unless-stopped`，但前提是 Docker daemon 得先起来）也起不来。
  **2026-09-01 的第一次尝试是错的，已被推翻**：当时① 用 pm2 接管了两个进程并 `pm2 save`，但没能完成 `pm2 startup`（生成的launchd配置需要sudo密码，Claude没法代跑），导致 pm2 daemon 本身在重启后也不会自动起来，救回来的进程列表形同虚设；② 以为改 `~/Library/Group Containers/group.com.docker/settings-store.json` 里的 `AutoStart:true` 就能让 Docker 开机自启——**验证后发现这个字段根本不是 macOS 真正读取的"登录时启动"开关**，Mac 于09-02重启后这个值又变回了`false`且Docker仍未自启，这条路走不通。
  **2026-09-03 验证过真正有效的修复（都不需要用户输密码）**：①用 `osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/Docker.app", hidden:false, name:"Docker"}'` 把 Docker.app 注册成正经的 macOS 登录项（这是 macOS 真正认的机制，不是app自己的内部配置文件）——`osascript -e 'tell application "System Events" to get the name of every login item'` 能查到已生效。②手写了一个per-user LaunchAgent `~/Library/LaunchAgents/com.banyuexuan.devservers.plist`（`RunAtLoad:true`，执行 `pm2 resurrect`），用 `launchctl bootstrap gui/$(id -u) <plist路径>` 加载——这一步全程不需要sudo（per-user LaunchAgent跟需要sudo的system-level LaunchDaemon是两码事，`pm2 startup`默认生成的是后者，这也是上次卡住的原因）。已实测验证：`launchctl bootstrap`触发后，`pm2 resurrect`会正确把 banyuexuan-api/banyuexuan-web 从 `~/.pm2/dump.pm2`（`pm2 save`保存的进程快照，改了`pm2.ecosystem.config.cjs`后要重新`pm2 save`一次）里恢复回来；如果这两个进程本来就在正常运行，重复跑`pm2 resurrect`不会打断它们（uptime/重启计数都不变），所以就算LaunchAgent在下次登录时和已经手动起好的进程"撞车"也不会有副作用。至此形成完整闭环：Mac重启→登录→Docker自动起→LaunchAgent自动跑`pm2 resurrect`→api因为要等MySQL就绪会崩几次，pm2的`autorestart+max_restarts:20+restart_delay:2000`自动重试直到MySQL ready为止（不需要额外写等待逻辑）。
  **2026-09-19 补：第三层根因（Sep 15 重启后又复发才发现）**：前两层修好后，重启电脑后 Docker 和 pm2 都自动起来了，但**登录仍报"服务器错误"**，因为——①`docker-compose.yml` 里 `restart: unless-stopped` 挡不住"关机/重启"：macOS 关机时 Docker 把容器记成"被正常停止"(Exited 255)，unless-stopped 语义就是"人为停过的不自动拉起"，所以 MySQL/Redis 每次重启电脑后都起不来 → 已改成 `restart: always`（容器 `docker inspect` 可验证 RestartPolicy=always）。②`PrismaService.onModuleInit()` 原来 `$connect()` 失败直接抛出，Nest 启动时 MySQL 还没好就崩；而 `nest start --watch` 外层 watcher 进程不会因为内层崩溃而退出（只在源码变化时才重新编译重启），pm2 看到外层进程"活着"所以**既不重启、`pm2 status` 还显示 online 好几天，实际端口 3000 根本没人监听**——这是最难排查的一层，判断标准是 `pm2 status` 显示 online 但 `lsof -iTCP:3000` 没结果 → 已改成失败后每2秒重试最多30次(~60秒)再抛出，并实测验证：MySQL停掉时API不再崩，MySQL起来后3秒内自愈、登录返回201。**以后排查"pm2显示online但连不上"，先 `lsof -iTCP:3000 -sTCP:LISTEN` 确认端口真的在监听，再 `pm2 logs banyuexuan-api --lines 40 --nostream` 看 error 日志有没有 PrismaClientInitializationError。**
  **How to apply**：以后如果用户还反馈打不开测试地址，先分层排查而不要瞎猜：`docker ps --format '{{.Names}} {{.Status}}'` 查 mysql/redis 容器；`pm2 status` 查 api/web 两个进程在不在/是不是一直重启(看`↺`列)；`curl localhost:3000/api/v1/health`和`curl localhost:5180`确认端口真的通。分别对症：docker没起→`open -a Docker`等daemon ready后`docker compose up -d`；pm2进程不在/daemon本身没了→`pm2 resurrect`（不要再用`nohup ... &`这种一次性的）。**如果连这套自愈机制本身失效了**（比如LaunchAgent被意外卸载/plist被删），用`launchctl list | grep banyuexuan`和`osascript -e 'tell application "System Events" to get the name of every login item'`两条命令确认这两层还在不在，缺了哪个就照上面重新配一遍，全程不需要用户输密码，不要再走`pm2 startup`那条需要sudo的老路。

- **"一次性" e2e 数据库要真正 DROP+CREATE，不能只重新 seed**（2026-09-22 踩过一次坑）：本机额外建了一个 `banyuexuan_e2e` 库专门跑全量 e2e（`banyuexuan_test` 密码是 Passw0rd!23、`banyuexuan_e2e` 也是——两个库当时为了避开admin密码不一致的问题分开建的，具体哪个库对应哪个密码，跑之前用 `curl .../auth/login` 试一下就知道，别凭记忆）。`prisma db seed` 是 upsert 语义，不会清空已有的业务数据行（合同/客户等）——如果上一次在这个库里跑过端到端测试（比如 P6 合同流程会真的创建客户/合同这些行，且不是幂等的，重跑会因为"不应该匹配到客户"这类断言而误报失败），必须先 `DROP DATABASE ... ; CREATE DATABASE ...`（复制 dev 库的 `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`）再 `migrate deploy` + `db seed`，才能保证这次失败是真的代码回归而不是上一轮测试留下的脏数据。踩坑现场：护理看板改完后跑全量 171 项，3 项失败都在 P6 合同流程，长得像回归，实际上是库里还留着上次合同模块开发时创建的"E2E合同客户"，全新库重跑后 171 项全过。
  **How to apply**：每次要用这个库跑"回归验证"之前，无脑先 `DROP DATABASE IF EXISTS banyuexuan_e2e; CREATE DATABASE banyuexuan_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`，别省这一步图快，省了会话到失败信息时容易误判成真回归、浪费时间排查。
