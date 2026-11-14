---
name: banyuexuan-care-board
description: 护理看板功能（母婴护理模块新页面，仿房态看板布局，展示护理核心信息），2026-09-22已实现完成、通过全量e2e、未提交未同步服务器
metadata: 
  node_type: memory
  type: project
  originSessionId: 6da5c295-1bf2-49c9-a670-299d979f017a
  modified: 2026-09-22T22:32:52.184Z
---

在"母婴护理"导航分组最上面新增了"护理看板"页面（`/care/board`），布局和房态看板一样（按门店+日期筛选、按楼层分组的房间卡片网格、状态配色直接复用房态看板那一套），但卡片内容改成护理核心信息，参照用户提供的竞品（一月妈咪）截图样式改造成本系统真实数据。

## 卡片内容与数据来源
- 房号/房型/状态：跟房态看板一样，来自 RoomService.getBoard()。
- 客户姓名：可点击跳转客户详情（跟房态看板同款）。
- 住店日期区间 + "第几天/共几天"：用入住/离店日期算的，不依赖母婴档案。
- **医嘱**：MotherProfile 新字段 `careNote`（自由文本，护理看板上的简短提示，和原有的 `remark`建档备注分开维护，用户说后续会承载"护理重点概要"）。
- **生产信息**（"09-20产（孕39周）"）：MotherProfile.deliveryDate + gestationalWeeks。
- **顺/剖徽章**：MotherProfile.deliveryMethod，颜色自定（VAGINAL绿"顺"、CESAREAN蓝"剖"、无数据灰"-"）。
- **性别徽章**：每个宝宝一个（BabyProfile.gender，多胞胎会显示多个）。
- **敏徽章**：母婴档案风险标签系统（Tag/TagBinding, entityType='MOTHER_PROFILE'）里绑定了"高敏"标签就点亮，新增了 CARE_RISK 标签分类种子数据（早产/传染病/高敏/妈咪住院，呼应 schema 注释里早就提到的这几个风险类别但之前没建过）。
- **妈妈护理档案/宝宝护理档案按钮**：按用户要求置灰不可点（这两个页面还没做，是未来要建的新页面，明确不同于现有的`/care/profiles`母婴档案页）。
- **无投诉**：固定显示文字，用户说后续会建投诉模块再关联，现在没有数据源。
- 用户明确去掉的：卡片右上角呼叫状态点（软件目前没打通呼叫器系统）、"提示:[修]"那一行、"欠费"标签（暂不做，财务信息先不放这里）。

## 关键设计点：母婴档案怎么关联到房间
一次入住只对应一条 MotherProfile（`occupancyId` 字段是"再次入住/二胎建新档"的锚点，schema 注释早就写明白），护理看板按 `occupancyId` 精确匹配，不是"取最新一条"这种模糊口径。**但现有的"建立母婴档案"表单(CareProfilesView.vue)原来没有暴露 occupancyId 选择器**——这是本轮顺手补的一个真实缺口，不补的话任何人通过现有UI建档都不会出现在护理看板上。现在建档时会列出这位客户还没结束的入住记录（预订中/已入住）供选择，可以不选（先建档，入住后再靠"编辑"补，但编辑表单目前也没开放改 occupancyId，只能改护理相关字段——如果以后要用，这里还得再加一个"关联入住"的编辑入口）。

## 后端实现
- 新模块 `apps/api/src/care/care-board/`：CareBoardService 组合调用 RoomService.getBoard()（跨模块注入，RoomEntityModule 已导出 RoomService）+ 按 occupancyId 批量查 MotherProfile+BabyProfile+高敏TagBinding，纯读聚合，不新增任何写操作。`GET /care/board?storeId=&date=`，权限 `care.board.view`。
- 权限点新增：`care.board`(PAGE) / `care.board.view`(BUTTON)，STORE_MANAGER/STORE_STAFF 都开放（跟 care.profile 同口径）。权限点总数 380。
- 迁移 `20260922000000_care_board`：仅一行 `ALTER TABLE mother_profiles ADD COLUMN care_note TEXT NULL`。

## 测试
- 后端接口直接用真实 dev 库数据验证过（37间真实房，25间已入住但没有母婴档案的房间 care 字段正确返回 null，不硬凑数据）；额外建了一条测试母婴档案（挂在真实入住 1612 房赵琼琼身上，剖宫产/孕39周/女宝/高敏标签）验证合并逻辑，验证完已在数据库层精确删除（MotherProfileService 不提供 delete 接口，"历史档案永久保留"是业务规则，测试数据只能手工在DB层清理，已确认无级联依赖后删的）。
- 浏览器实测：桌面宽度和手机宽度(375px)都看过，布局正常；已登录用户加了新权限点后要重新登录才能拿到新令牌（旧token不会自动带上新权限，属于正常现象不是bug）。
- **全量 e2e**：改动后跑了 171 项，首次在复用的 `banyuexuan_e2e` 库上跑出 3 个失败，排查后确认是库里残留了上一轮合同模块测试的数据（"E2E合同客户"）导致的断言误判，跟护理看板改动无关；DROP+CREATE 全新库后重跑 171 项全过，详见 [[banyuexuan-working-style]] 里新补的"一次性e2e库要真清空"教训。

## 待办 / 已知缺口
- 母婴档案的**编辑**表单（CareProfileDetailView.vue）目前不能改 occupancyId，只能在**新建**时选；如果建档时没选、之后想补，现在没有UI入口（要么以后加，要么走数据库）。
- "妈妈护理档案/宝宝护理档案"两个新页面还没设计/开发，按钮先占位置灰；这两个页面上线后，要把护理看板卡片上的按钮从置灰改成真正可点的跳转链接。
- "欠费""提示""无投诉"三处用户明确说了后续会做（欠费用现有合同/收款数据能算但先不接；无投诉要等新的投诉模块；提示已去掉不再需要）。
- 没有 commit，没有同步服务器。参见 [[banyuexuan-contract-redesign]] 里关于本机改动同步服务器的注意事项，同样适用（数据库迁移+新权限点都要带上）。
