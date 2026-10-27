---
name: banyuexuan-care-archive-design
description: 护理档案（妈妈/宝宝）三大块的设计共识与已定业务规则（2026-10-05讨论），等用户发纸质表格后再统一改
metadata:
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-10-05T06:59:12.269Z
---

护理档案分三块（用户思路，我已认可并补充）：①护理计划（入所评估→个人化计划，版本制，周期评审）；②服务执行记录（打钩型：洗澡/抚触/催乳等，谁做的几点做）；③定时监测记录（测量型：妈妈体温血压宫底恶露伤口乳房，宝宝体重黄疸奶量大小便脐带）。妈妈、宝宝各一份档案，结构相同内容不同。

**用户已定的业务规则**
- 护理等级：暂分 3 级，每级的服务内容/频次先参照医院三级护理制定（后期可调）。
- 计划制定人：护理长；审核和监督：护理主任。
- 评审：两种并存——①每 7 天护理长定期评审；②护理主任不定期查房时可随时更新计划。
- 每次评审留痕：上阶段执行结果 + 调整后的新版本，旧版本只读保留。

**我的设计建议（已提给用户）**：入所评估单独定格保存；等级挂在计划版本上；③异常提示评审、评审到期提醒；护理看板的等级/医嘱取自当前计划版本；出所自动生成护理小结（可对客户可见）；现有底座（字段→项目→方案→CarePlan 任务→CareRecord→异常）可复用于②③，①需新建。

**2026-10-05 纸质表格已收到并识别完**（照片在 `~/Desktop/百度同步盘/伴月轩AI系统开发/护理档案资料/`，HEIC，用 sips 转 JPEG）。用户要求：产妇入住评估单、新生儿入所评估、妈妈出所评估、宝宝出所评估（单次）、新生儿和产妇日常护理记录（每日一份，住几天填几份）、产妇常规护理计划（要结合护理计划丰富）、新生儿用药委托书（多份、记录变化、保存家属授权签字）——都要**结构化 + 拍照留档 + 拍照AI识别后人工复核再入库 + 手机/电脑每日录入 + 可筛选统计**；会所入所宣教、呛奶应急预案只拍照留档；异常报警后面再做。
完整方案和字段清单见仓库 `docs/护理档案_纸质表格结构化方案.md`（含 6 个待用户确认的问题）；占位事项见 `docs/待完善清单.md`。分期：P1 留档+4张单次评估+识别复核 → P2 每日记录 → P3 用药委托书 → P4 护理计划+服务执行记录 → P5 统计/出所小结。
**用户已同意方案（6 个问题全部通过：拆分计划/记录、每日一份妈妈+宝宝合一、用药委托书补字段、风险告知书只留档、一二三级护理命名、按 P1~P5 顺序做），2026-10-05 开始实施。**
**P1 已完成（本机，未提交未同步）**：四张单次评估表（`CareMotherAdmission/CareBabyAdmission/CareMotherDischarge/CareBabyDischarge`，字段全是独立列）+ `CareDocument/CareDocumentFile` 资料留档；字段说明书单一来源 `apps/api/src/care/care-assessment/assessment-specs.ts`（后端校验入库、前端 `SpecForm.vue` 自动生成表单、AI 提示词都读它；改字段要同步改 schema.prisma，可用 `scripts/gen-assessment-models.ts` 生成模型文本）；AI 识别 `apps/ai-service/app/vision/care_form_extractor.py`（字段说明书随请求传入，两种清晰度各读一遍互校，不一致/超范围/没把握的标黄；`/care-form/extract`、`/care-form/normalize`（HEIC→JPEG，需 pillow-heif））；识别结果存 `CareDocument.extractData`，人工复核点"确认入库"才写评估表；已确认的原件不能删；权限复用 `care.profile.*`。前端在母婴档案详情页标签页（概览/入所评估/护理计划与异常/日常护理记录[占位]/用药委托书[占位]/出所评估/资料留档/离店后关怀）。迁移 `20261007000000`、`20261007010000`；存储目录 `CARE_STORAGE_DIR`（默认 apps/api/storage/care）。四张真实纸质表实测识别质量很好（姓名签名字迹潦草会标黄）。pm2 的 ai 进程已清空代理环境变量（国内模型接口直连；之前继承了失效的科学上网代理导致"All connection attempts failed"）。
**2026-10-05 用户验收后的调整（已做）**：母婴档案列表加"房号"列（后端 list 带 customer/occupancy.room）+ 客户下方列出宝宝（名字/性别/体重/出生日期）+ 搜索 + 手机卡片；宝宝档案可删除（`DELETE /care/baby-profiles/:id`，有护理数据的拒绝，删后序号重排）；"资料留档"拆成 风险告知书/入所宣教/呛奶应急预案 三个并列标签（`CareArchivePanel.vue`，只留档资料上传 24 小时内可删），未入库草稿显示在入所/出所评估标签顶部。**所有新页面要兼顾手机显示和录入**（用户明确要求）。
**P2 已完成（2026-10-05，本机，未提交未同步）**：日常护理记录 = `CareDailyRecord`（妈妈栏，一妈妈档案一天一条）+ `CareDailyBabyRecord`（每宝宝一栏）+ `CareFeedingEntry`（喂养行）；字段说明书 `care-daily/daily-specs.ts`（脚本 `scripts/gen-daily-models.ts` 生成模型文本）；接口 `/care/daily/{specs,days,day(GET/PUT整天保存),pending}`，懒创建、乐观锁、汇总（奶粉总量/小便/大便次数）自动算；AI 识别支持表格字段（ai-service `kind:'table'`，行号级标黄 `feedings.2.formulaMl`），真实日常记录单 8 行喂养全对；前端 `DailyRecordsPanel/DailyRecordDialog/FeedingTable`，手机卡片行录入；护理看板卡片显示今日记录已填/未填；看板“妈妈/宝宝护理档案”合并成“母婴档案”按钮。宝宝删除：有评估表/资料时需 `care.profile.force-delete`（管理员）+输入宝宝名字，有护理记录/计划/异常的任何人不能删。迁移 `20261008000000`。
**P3~P5 已完成（2026-10-05，本机，未提交未同步）**：P3 用药委托书 `CareMedicationAuth/Item`（变更链 previousAuthId、状态 ACTIVE/SUPERSEDED/STOPPED、签字原件挂 documentId、AI 识别含 table、日常记录按有效委托选药）；P4 `CarePlanVersion`（版本制、状态 DRAFT/PENDING_REVIEW/ACTIVE/SUPERSEDED/REJECTED、等级 LEVEL1-3、来源 INITIAL/REGULAR_REVIEW/DIRECTOR_ROUND、7 天评审、主任直接生效 directActivate）+ `CareServiceLog` 服务执行，标准在 `care-plan-version/care-standards.ts`（三级=宣教标准，一二级草案待主任审定）；审核权限点 `care.profile.approve`（店长/管理员有，员工没有，`standards.canApprove` 给前端）；P5 `GET /care/stats/{metrics,query}` + `GET /care/summary/:id`，前端“护理统计”页（`/care/stats`）和档案“出所小结”标签。迁移 `20261009000000`、`20261010000000`。母婴档案自动关联入住：入住/预订创建或办理入住时关联客户最近一份未关联档案；建档时自动关联当前入住；编辑里可手选。P1~P5 全部完成，剩余见待完善清单（报警 N21、提醒 N22、签名 N12/N20 等）。
（旧）**下一步 P3**：用药委托书（多版本、签字照片、补宝宝姓名/剂量/疗程/变更说明、与日常记录“用药”联动）。
（旧的"下一步 P2"）：每日护理记录（妈妈+宝宝合一份，按入住天数自动生成待填，手机可录，补产妇血压/脉搏和宝宝黄疸栏）。之后 P3 用药委托书、P4 护理计划+服务执行记录、P5 统计/出所小结/报警。
（以下是原先方案阶段记录）宣教文件里有标准护理频次（体温每天1次、血压入所前3天每日1次、体重每周1次、洗头产后14天后每周1次、泡脚产后10天后每周1次；宝宝洗澡隔天1次、游泳每周1次、专家查房每周1次、床品每周换）可作"三级（常规）护理"默认值。

**Why:** 用户要先让我看完真实表格再定方案（合同模块同样的做法，按真实样张建模更准）。
**How to apply:** 收到表格后先逐张识别、汇总字段清单和差异再与用户确认，再改 schema/页面。关联 [[banyuexuan-care-board]]。
