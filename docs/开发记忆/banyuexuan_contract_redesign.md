---
name: banyuexuan-contract-redesign
description: 合同管理模块改造方向（纸质合同拍照上传+AI提取核心数据+待排房联动），2026-09-20用户已确认的决策和待办
metadata: 
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-09-22T05:58:15.074Z
---

合同管理模块要从"系统内电子合同（模板正文→客户签署→审批）"改成"纸质合同台账 + 原件存档 + AI提取核心数据"。用户 2026-09-20 确认的决策：

- 线下签纸质合同，销售拍照/传PDF上传，系统AI读图提取数据，销售在核对页确认后才入库（AI只预填，人终审）。原件必须上传，存服务器本地磁盘（空间不够再扩容）；备份脚本目前只备份数据库，做这个模块时要把图片目录加进备份。
- **不要**审批流程，**不要**合同模板，去掉"客户签署"（signedByCustomerAt/Ip）和合同正文字段。
- 要提取的数据：合同编号（纸质上的）、客户姓名、手机号、签约日期、签单人（销售）、套餐（名称、房型、南北向、套餐天数）、护理模式（1对1/1对2）、入住/离店日期、合同金额、已收款项（多笔）、合同约定的赠送/加购项目。
- **合同上只写房型，没有房号**：销售按签单先后在房态图上手动排房。所以合同确认后进入"待排房"，房态横排加"待排房合同"列表，点合同再点房态图空档生成预订（带入合同信息），排完变"已排房"。不要自动生成带房号的预订。
- 赠送项目只做记录，不对应产康项目/不生成客户已购服务包。
- 房态看板卡片上目前是 `-` 占位的"套餐/护理模式/签单人/护理等级/护理师"，其中前三项以后从合同读取（签单人现在临时取客户归属销售）。

分三步：①数据结构+原件上传+手工核对页（不接AI）②接入AI读图预填 ③联动（客户匹配/新建、房态排房、收款记录）。

**Why:** 用户的业务是线下纸质签约，软件只做数据整理；合同里有身份证号手机号，原件要单独权限。
**How to apply:** 开工前先等用户发真实合同照片样张（版式决定字段），火山引擎(豆包)读图模型的API Key用户晚点提供——提醒用户放进服务器配置文件，不要贴在聊天里。现有ai-service（apps/ai-service，provider有volcengine/deepseek/minimax）只支持文字，需要扩展图片输入。库里现有1条测试合同、1条测试模板、1条测试收款（Payment绑合同），改造时清理。合同相关e2e用例会受影响。参见 [[banyuexuan-project-status]]、[[banyuexuan-working-style]]。

## 2026-09-20 看过3份真实合同样张后的发现（桌面 /Users/alston/Desktop/合同扫描件/，母婴护理服务协议 PDF，纯图片无文字层）
- 三份同一版式：封面+协议正文(第1-6页)+附件一~四+健康告知书+封底，共14页。手写内容只集中在：封面(编号如 2026-08-363、产妇姓名、预产期、签约日期)；正文第1页(姓名、身份证号、产检医院、电话、家庭地址、紧急联系人/关系/电话、预产期、单胎/双胎勾选、预订房型+护理模式(如一对一)+套餐天数)；第2页(套餐金额大小写、订房定金大小写；押金是印刷固定值1000/双胎2000)；第6页(签字日期)。AI只需读这几页。金额大小写并存，可交叉校验。手写较潦草。
- 合同上**没有**：签单人(销售)、入住/离店日期(只写"入住当日起算")、赠送项目、实际已收款项(只有约定的套餐金额和定金)。计划：签单人默认=上传人；入住日期由销售核对/排房时填，离店=入住+套餐天数；定金在核对页勾选已收；赠送项目待用户说明写在哪。
- 客户档案没有身份证号字段(当初刻意没加)，是否入库待用户定；建议只留在原件。
- 火山引擎Key（已查明，2026-09-20）：用户订阅的是火山方舟 **Agent Plan 个人版(max)**（给 Claude Code/OpenCode 等编程工具用的套餐），密钥是"专属密钥"，只能用专属地址 `https://ark.cn-beijing.volces.com/api/plan`（Anthropic 格式 `POST /v1/messages`，`Authorization: Bearer <key>`，带 `anthropic-version: 2023-06-01`），用普通地址 `/api/v3` 会报"密钥无效"（之前误判的原因）。已实测：文字OK、读图OK（模型 `doubao-seed-2-0-code-preview-260215`，平台实际路由到 doubao-seed-2-1-turbo-260628）。配置在 `apps/ai-service/.env`（被git忽略，权限600），变量名 VOLCENGINE_PLAN_API_KEY / _BASE_URL / _MODEL。现有 ai-service 的 volcengine provider 是 OpenAI 格式打 /api/v3，接读图时需新增一个 Anthropic 格式的 plan provider。
- 风险（未能核实条款原文，官网文档是脚本渲染读不到）：Agent Plan 官方定位是编程工具套餐（文档只列 Claude Code/OpenCode/OpenClaw/Hermes Agent），用它当生产业务系统的后端可能超出套餐用途/被限流，额度也和用户自己写代码共用。建议：开发验证期可用；正式上线用方舟"控制台按量(platform)"密钥+/api/v3，需用户届时另申请。Key 已在聊天里出现过，建议轮换。

## 2026-09-20 用户拍板的细节（覆盖前面的"建议默认"）
- 测试阶段身份证号/姓名/电话等都不用保密，按普通信息处理：身份证号、紧急联系人(姓名/关系/电话)作为客户档案字段直接存，不打码。
- 套餐天数"N+N"（如28+28）：第一个N=所内入住天数，第二个N=出所后"护理到家服务"天数；房态只记第一个N。离店日期=入住日期+第一个N。两个数分开存（到家服务天数默认0）。
- 赠送项目：AI自动识别手写文字并录入，保留手工修改；识别不清必须给醒目提示让销售手工补录/修改；没有额外赠送（大多数合同是统一格式）则留空、不提示。3份样张中都没有手写赠送项目，不知道赠送通常写在合同哪个位置——处理办法：AI检查所有页有没有"额外手写内容"并提示。
- 已实测读图模型读手写：编号/姓名/预产期/身份证/电话/地址/紧急联系人/金额大小写基本正确；易错：套餐行"房型-房号(护理模式)-天数"栏位会对错位、签名笔迹同一人名被读成多种写法。对策：姓名取封面+第1页手写栏交叉比对、套餐行单独裁剪放大重读、金额大小写互校、拿不准的标黄给核对页。3份样张的页序一致：PDF第1页封面、第2-3页=正文第1-2页(手写集中)、第7页=正文签字页。定金≈套餐金额30%（3份样张吻合，仅供参考）。
- 已给用户看过核对页样图（原件+分区表单+状态标签：已识别/请核对/缺失/自动算出），待用户确认后开工；因读图已验证可行，建议第一步和第二步合并做。
- 赠送项目一般写在合同**正文第1页或第6页**（=PDF第2页或第7页）：AI要重点读这两页；此外仍检查所有页有无额外手写内容。样图（核对页）用户已确认不用修改，可开工；开工时把"入住日期"字段改叫"预估入住日期"（见 [[banyuexuan-room-dates-are-estimates]]）。

## 施工进度（2026-09-20 晚）
- **工作目录**：所有代码改动都在 worktree `.../worktrees/postpartum-center-software-architecture-1aa44f`（本机 pm2 服务也跑在这里）。会话曾绑定在另一个 worktree(remote-control-cff090)，写文件被拦，已用 EnterWorktree(path) 正式切换过来；新会话若又被绑到别的 worktree，先切过来再改代码，不要绕过限制。Bash 里复合命令（cd && heredoc、跨目录写）会被拒，要拆成单条命令或用 Write/Edit 工具。
- **切片A 已完成（AI识别引擎，全部在 apps/ai-service，未提交）**：app/providers/volcengine_plan.py(Anthropic格式读图客户端)、app/vision/{pages.py(PDF/照片→逐页JPEG),parsing.py(大写金额/日期/身份证校验位/N+N天数/护理模式/朝向解析),contract_extractor.py(逐页读图+汇总+多次高清再读多数表决+提醒清单)}、app/routes/contract.py(`POST /contract/extract`，JSON base64 入，返回 data/warnings/pages(JPEG base64)/raw)、scripts/extract_contract_cli.py(命令行复测)、tests/test_contract_parsing.py(共26个单测全过，跑法 `cd apps/ai-service && .venv/bin/python -m pytest -q tests`)。venv 在 apps/ai-service/.venv（已装 pymupdf、pillow）。真实3份样张实测：14页类型全认对，约60秒/份；金额三份都读对；编号/日期/身份证/手机基本准；套餐行(房型/护理模式/天数)和签名笔迹仍不稳，靠标黄+人工核对兜底。
## 2026-09-21/22 施工完成：切片B~E 全部做完，未提交未推送
- **数据库**：迁移 `20260921000000_contract_paper_archive` 已在本机 dev 库和独立 test 库（banyuexuan_test）跑过；Contract 新增全部字段、去掉模板/签署/续签相关字段、ContractStatus 加 PENDING_REVIEW；新表 ContractFile/ContractItem/ContractExtraction；Customer 加 idCardNo + 紧急联系人3字段。权限点 378 条（去掉 contract.template.*、contract.record.{sign,submit,renew}，改成 contract.record.{view,upload,update,confirm,void,delete}）；void 仍只留给 SUPER_ADMIN（继承旧策略）。
- **后端**（apps/api/src/contract/）：contract-storage(磁盘存储，路径穿越防护，CONTRACT_STORAGE_DIR 环境变量可配，默认 apps/api/storage/contracts，已加进 apps/api/.gitignore)、contract-extraction(后台识别队列，同时最多2份，服务重启会把卡住的 PENDING/RUNNING 标 FAILED 提示重试)、contract-record(上传/手工新建/核对更新/确认入库/作废/删除/重新识别/原件下载/客户智能匹配)。AiGatewayClient 加了 extractContract()（5分钟超时）。room.service.ts 的 getBoard() 现在带出 contract 字段(careMode/orientation/inHouseDays等)和 actualCheckInAt。
- **前端**：合同列表页(ContractsView，5个状态tab+上传/手工新建，识别中每4秒轮询)、核对页(ContractDetailView+ContractField组件，左原件右表单，AI提醒标黄/标红，预产期改预估入住联动，赠送项目编辑)、客户详情页/收款页联动改造；房态横排加"待排房合同"面板(按签单先后，点合同高亮同房型房间，点空档预填客户+日期+contractId，房型不符会二次确认)；房态看板卡片的套餐/护理模式从合同读，"入住日期"改成"预计入住"（预订中）vs 实际入住日期（已入住），呼应 [[banyuexuan-room-dates-are-estimates]]。
- **测试**：ai-service 30个单测全过；apps/api 新增 `test/p6-contract-paper-flow.e2e-spec.ts`（9项，mock掉ai-service的HTTP调用不花模型费）+ 改了 p1/p5 里的合同步骤；**全量171项 e2e 在独立库 `banyuexuan_e2e`（新建的一次性库，跟 banyuexuan_test 分开，因为要用 SEED_DEV_PASSWORD=change-me 而 banyuexuan_test 之前seed的密码是Passw0rd!23）跑通169/171，唯一的1个偶发失败(水电费登记月份撞车)单独重跑通过，与本次改动无关**。UI也手工实测过：用3份真实合同PDF跑通了上传→识别→核对页展示（含AI提醒/原图翻页）；房态横排排房生成预订、房态看板读合同信息都用临时建的测试房间/客户验证过，验证完已用API精确删除（未碰真实数据，dev库customers/rooms/occupancies计数验证过前后一致）。
- **待办**：还没有真实的"带手写赠送项目"的合同样本验证过赠送识别；合同相关操作还没有对着真实账号权限（store_manager现在是禁用状态，测试时用test_user代替）做完整UI走查；没有 commit，没有同步服务器（同步时数据库迁移+新权限点+CONTRACT_STORAGE_DIR+新e2e都要带上，且 apps/ai-service 需要加进服务器的 pm2/systemd 常驻，参见 [[banyuexuan-server-access]]）。

## 2026-09-22 用真实合同跑通完整流程时，意外产生了一条真实生产数据（用户已确认保留，不要回滚）
用《母婴护理服务协议(4).pdf》（张瀛方）测试"上传→AI识别→核对→确认入库→排房"全流程时，AI识别出的姓名撞上了 2026-09-19 房态表导入的真实客户「张瀛方」（customer_no C20260919581410，2024年在1619房住过一胎）。问过用户，确认是同一人**二胎第2次入住**，指示"新合同应保留，和之前的合同分开留档"。已执行：
- 客户 c1d89d9868b6be17e79619e19 的手机号/身份证号/地址/紧急联系人 已从这份新合同补全（原来是空的，走的是"只补空缺不覆盖"逻辑，正常）；expectedDueDate 已从旧的 2024-09-02（一胎）手动改成新的 2027-03-21（二胎，遵用户指示，因为合同确认流程本身不会覆盖已有值）。
- 合同 cmuc6t09c0022zfvpyy6w3hva（纸质编号"2026-09-19-TEST"——**这是我测试时随手填的占位编号，不是真实合同编号，如果销售后续要核对，需要提醒改成合同上真实的编号**）已确认入库(ACTIVE)，并排到 2407 房（南向·至爱），预订 2027-03-25~2027-04-22，状态 RESERVED。
- 这是当前系统里唯一一条这位客户的 Contract 记录（新 schema 没有续签/关联字段，合同之间本来就互不覆盖，"分开留档"这个诉求已经满足，不需要额外建模）。
- **母婴档案(MotherProfile)有没有需要为二胎单独建档，本轮没有处理**（超出合同模块范围；`GET /care/profiles?customerId=` 路径不对返回404，没查到现状，之后有母婴护理相关会话时应该先查清楚这位客户的母婴档案情况）。
