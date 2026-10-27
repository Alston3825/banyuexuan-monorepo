---
name: banyuexuan-care-signature-design
description: 护理档案签字方案（2026-10-07 用户拍板）：哪些纸质留档不做电子签名、护理师用账号+签名图签日常记录、客户通过链接确认每日服务报告并给护理师打分，及防代点设计
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-07T06:16:09.308Z
---

**用户的业务决定（2026-10-07）**
- 产妇/新生儿入所评估、风险告知书、入所宣教、用药委托书、呛奶应急预案：**必须留纸质，不做电子签名**。
- 护理师签字：注册后提醒**一次性录入电子签名图**，之后在护理档案里"选用"。服务模式有 **1对1 与 1对多（一个护理师同时服务2~3位客户）**，早晚班可能是不同人，休假时还会有第三/第四位护理师替班 → 日常记录要支持多人各自签字。
- 每日护理记录：护理师每天把"产妇记录要点 + 宝宝记录重点"汇总成**每日服务报告**，通过**微信小程序链接**发客户（小程序后期做）。三个目的：①让客户知道服务按要求完成 ②客户签字确认（规避客诉）③客户给**每日护理师**的服务打分。
- 客户确认：可手写签名或点按钮；**前期不要求每天确认，可一周内集中补确认，但不能超过 7 天**；要能确定"是客户本人确认、不是被快速连点/护理师代点"。

**已实现（本机，2026-10-07；部署状态见 docs/待完善清单.md N25）**
- 表：`care_daily_signatures`（护理师签字，每人每条日常记录一条，白班/夜班/替班，存签名图快照+内容指纹）、`care_confirm_links`（7天链接，只存哈希）、`care_daily_confirmations`（客户确认，含整体分、每位护理师分、手写图/按钮、证据）、`staff_devices`（员工登录过的设备号）、`accounts.signature_data`。
- 后端 `apps/api/src/care/care-signature/`；员工接口 `/me/signature`、`/care/daily/{signatures,sign-overview,confirm-links}`；客户公开接口 `/public/care-confirm/:token/{info,verify,days,confirm}`（后期小程序直接复用）。
- 防代点：链接随机+7天+重新生成旧的作废；手机号后四位核验（错5次锁30分钟）；服务器计时"看够时间"（基础6秒+每多一天2秒）；确认内容必须与看到的一致（期间被改要重看）；点击确认要长按1.5秒；手写签名证据最强；设备号与员工登录过的设备相同→打 `STAFF_DEVICE` 标记且该设备上不接受点击确认；同设备替≥3位客户确认→`MULTI_CUSTOMER_DEVICE`。
- 内容指纹 `contentHash`：签字/确认后记录再被改，页面显示"需重新签字/确认后有改动"。
- 前端：`SignaturePad.vue`、`MySignatureDialog.vue`（登录后提醒一次，顶部用户菜单"我的电子签名"）、`DailySignPanel.vue`（日常记录弹窗底部）、`ConfirmLinkDialog.vue`、客户页 `views/public/CareConfirmView.vue`（路由 `/c/:token`，meta.public）。
- 顺手修了生产隐患：`main.ts` 生产环境 `trust proxy` = 2（宿主机 nginx + web 容器 nginx），否则 req.ip 是内部代理地址、全员共用限流、证据里的 IP 不真实（`TRUST_PROXY_HOPS` 可覆盖）；**部署后要核实审计日志里的 IP 是真实客户 IP**。

**待办**：小程序对接、短信验证码升级（需腾讯云短信）、满意度统计页——见待完善清单 N26~N29。

关联：[[banyuexuan-care-archive-design]] · [[banyuexuan-deploy-20261006]]
