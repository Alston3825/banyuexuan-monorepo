/**
 * 《客户满意度调查表》三张纸质表的定义（住满第 5 / 15 / 25 天各发一张）。
 * 每个评分项在纸上是 [12]…[0] 一排格子，客户在选定的分值上打“✓”；分值越高越满意（12=非常满意，0=非常不满意）。
 * 另有两个手写栏：“其它意见和建议 / 需要改进的地方”和“值得表扬的人、事、物”。
 */
export const SCORE_MAX = 12;
/** 统计分档：≥10 满意；7~9 一般；≤6 不满意 */
export const SATISFIED_MIN = 10;
export const UNSATISFIED_MAX = 6;

export interface SurveyItem {
  key: string;
  label: string;
}
export interface SurveyGroup {
  key: string;
  title: string;
  items: SurveyItem[];
}
/** 一张满意度模板（数据库里的 SatisfactionTemplate 去掉管理字段后的内容，也是 AI 读图识别和统计用的“表单定义”） */
export interface TemplateSpec {
  id: string;
  name: string;
  sortNo: number;
  /** 入住第几天做这张调查；空=不自动提醒 */
  day: number | null;
  /** 评分尺上端/下端的文字：如“好/不好”“合理/不合理” */
  goodWord: string;
  badWord: string;
  groups: SurveyGroup[];
  suggestionLabel: string;
  praiseLabel: string;
}

const PRAISE = '我们月子中心值得您表扬的人、事、物';

/** 内置的三张表（每个租户首次使用时自动生成成模板，之后可在“满意度模板”里随意修改） */
export const DEFAULT_TEMPLATES: Omit<TemplateSpec, 'id'>[] = [
  {
    sortNo: 1,
    name: '客户满意度调查表［一］',
    day: 5,
    goodWord: '好',
    badWord: '不好',
    groups: [
      {
        key: 'env',
        title: '环境感知',
        items: [
          { key: 'env1', label: '客房的设施设备配备是否齐全，使用是否满意' },
          { key: 'env2', label: '客房卫生的清洁是否满意' },
          { key: 'env3', label: '公共环境的设施及卫生是否满意' },
        ],
      },
      {
        key: 'expect',
        title: '预期感知',
        items: [
          { key: 'exp1', label: '中心整体的服务水平是否达到您的预期' },
          { key: 'exp2', label: '中心的服务响应速度、周到性是否达到您的预期' },
          { key: 'exp3', label: '中心的餐食是否达到您的预期' },
          { key: 'exp4', label: '中心的服务是否满足您的个性化需求' },
        ],
      },
    ],
    suggestionLabel: '您的其它意见和建议',
    praiseLabel: PRAISE,
  },
  {
    sortNo: 2,
    name: '客户满意度调查表［二］',
    day: 15,
    goodWord: '好',
    badWord: '不好',
    groups: [
      {
        key: 'quality',
        title: '质量感知',
        items: [
          { key: 'q1', label: '您的主管护理人员的服务是否主动、热情、迅速' },
          { key: 'q2', label: '您的主管护理人员服务的专业技术度如何' },
          { key: 'q3', label: '中心员工是否能对您提出的宝妈康复和育儿知识等问题做出及时满意的答复' },
          { key: 'q4', label: '中心的餐食搭配、口味、数量您是否满意' },
          { key: 'q5', label: '中心餐食是否根据您的自身情况及时做出相应的调整' },
        ],
      },
      {
        key: 'satisfy',
        title: '满意感知',
        items: [
          { key: 's1', label: '产后康复服务的态度、手法等是否满意' },
          { key: 's2', label: '为宝宝、宝妈摄影服务是否满意' },
          { key: 's3', label: '中心提供的其他妈妈沙龙（如瑜伽、各专业医疗咨询等）服务您是否满意' },
          { key: 's4', label: '您对我中心所提供服务的整体满意度如何' },
        ],
      },
    ],
    suggestionLabel: '我们还有哪些需要改进的地方',
    praiseLabel: PRAISE,
  },
  {
    sortNo: 3,
    name: '客户满意度调查表［三］',
    day: 25,
    goodWord: '合理',
    badWord: '不合理',
    groups: [
      {
        key: 'value',
        title: '价值感知',
        items: [
          { key: 'v1', label: '中心的房间售价是否合理' },
          { key: 'v2', label: '中心产后康复服务（泌乳、宝妈身体恢复等）的价格是否合理' },
          { key: 'v3', label: '宝宝、宝妈摄影服务的价格是否合理' },
          { key: 'v4', label: '中心提供的其他宝妈收费沙龙（如瑜伽、各心理咨询、育儿嫂外派等）服务价格是否合理' },
        ],
      },
      {
        key: 'experience',
        title: '服务体会',
        items: [
          { key: 't1', label: '您是否会向您的亲友推荐我们中心' },
          { key: 't2', label: '中心的服务响应速度、周到性是否达到了您的预期' },
          { key: 't3', label: '中心的餐食是否达到了您的预期' },
          { key: 't4', label: '中心的服务是否满足您的个性化需求' },
        ],
      },
    ],
    suggestionLabel: '您的其它意见和建议',
    praiseLabel: PRAISE,
  },
];

export const formItems = (spec: Pick<TemplateSpec, 'groups'>): SurveyItem[] => spec.groups.flatMap((g) => g.items);

/** 给 AI 读图用的字段说明书（接口同护理表格识别） */
export function surveyAiSpec(spec: TemplateSpec) {
  const scoreHint = '这一行有 13 个格子，格内印着 [12] [11] … [1] [0]（从左到右分值递减）。客户在选定的分值格上画了“✓”，输出被打勾那一格方括号里的数字；勾画可能压在数字上或略偏向相邻格，请按勾的主要落点判断；没打勾填 null；不要把印刷的数字当成答案';
  return {
    formTitle: spec.name,
    description: `这是伴月轩月子中心的《${spec.name}》${spec.day ? `（客户住满第 ${spec.day} 天填写）` : ''}。表格里每个评分项一行，客户在 0~12 的分值格上打勾（12=非常满意（${spec.goodWord}），0=非常不满意（${spec.badWord}））；下面是手写的意见栏，最底下一行是客户姓名、房号、管家姓名、责任护士、日期等手写信息，地址、电话常常空着。只抄写纸上客户/工作人员手写的内容，印刷的说明文字不要抄。`,
    fields: [
      { key: 'customerName', label: '客户姓名', kind: 'text', aiHint: '底部“客户姓名：”后面手写的名字' },
      { key: 'roomNo', label: '房号', kind: 'text', aiHint: '底部“房号：”后面手写的内容，原样抄' },
      { key: 'stewardName', label: '管家姓名', kind: 'text', aiHint: '底部“管家姓名：”后面手写的名字' },
      { key: 'nurseName', label: '责任护士', kind: 'text', aiHint: '底部“责任护士：”后面手写的名字，空着就填 null' },
      { key: 'surveyDate', label: '填写日期', kind: 'text', aiHint: '底部“日期：”后面手写的日期，如 10.24，原样抄' },
      { key: 'phone', label: '电话', kind: 'text', aiHint: '底部“电话：”后面手写的内容，空着填 null' },
      ...formItems(spec).map((i) => ({ key: i.key, label: i.label, kind: 'int', min: 0, max: SCORE_MAX, aiHint: scoreHint })),
      { key: 'suggestion', label: spec.suggestionLabel, kind: 'longtext', aiHint: '“' + spec.suggestionLabel + '”框里客户手写的文字，按行抄写，字迹看不清的字用 □ 代替；空着填 null' },
      { key: 'praise', label: spec.praiseLabel, kind: 'longtext', aiHint: '“值得您表扬的人、事、物”框里客户手写的文字；空着填 null' },
    ],
  };
}

/** 给上传的 PDF/图片读图生成模板用的字段说明书 */
export function templateImportAiSpec() {
  return {
    formTitle: '调查问卷/满意度调查表（读出表格结构）',
    description: '这是一份客户满意度调查表或问卷。请读出它的结构：标题、评分尺两端的文字、按“分组标题”归类的评分题目、以及手写意见栏的名称。不要抄客户手写的内容，只读印刷的题目文字。',
    fields: [
      { key: 'title', label: '表格标题', kind: 'text', aiHint: '最上面的大标题' },
      { key: 'goodWord', label: '评分尺“好”端的文字', kind: 'text', aiHint: '评分尺最好那一端括号里的词，如 好 / 合理 / 满意；找不到填 null' },
      { key: 'badWord', label: '评分尺“差”端的文字', kind: 'text', aiHint: '评分尺最差那一端括号里的词，如 不好 / 不合理 / 不满意；找不到填 null' },
      { key: 'suggestionLabel', label: '意见建议栏的名称', kind: 'text', aiHint: '如“您的其它意见和建议”“我们还有哪些需要改进的地方”；没有填 null' },
      { key: 'praiseLabel', label: '表扬栏的名称', kind: 'text', aiHint: '如“值得您表扬的人、事、物”；没有填 null' },
      {
        key: 'items',
        label: '评分题目',
        kind: 'table',
        columns: [
          { key: 'group', label: '所属分组标题', kind: 'text', aiHint: '这道题上面最近的分组标题（如 环境感知、服务体会）；没有分组填 null' },
          { key: 'label', label: '题目文字', kind: 'text', aiHint: '完整的题目原文，不含序号' },
        ],
      },
    ],
  };
}

/** 去掉空白、重复，保证每道题都有唯一的 key；已有的 key 原样保留（历史评分按 key 存，不能变） */
export function normalizeGroups(raw: unknown): SurveyGroup[] {
  const used = new Set<string>();
  const groups = Array.isArray(raw) ? raw : [];
  for (const g of groups) for (const it of Array.isArray(g?.items) ? g.items : []) if (typeof it?.key === 'string' && it.key) used.add(it.key);
  let n = 0;
  const fresh = (): string => {
    let k: string;
    do k = `i${Date.now().toString(36)}${(n++).toString(36)}`;
    while (used.has(k));
    used.add(k);
    return k;
  };
  const seen = new Set<string>();
  const out: SurveyGroup[] = [];
  for (const g of groups) {
    const items: SurveyItem[] = [];
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const label = String(it?.label ?? '').trim();
      if (!label) continue;
      let key = typeof it?.key === 'string' && it.key && !seen.has(it.key) ? it.key : fresh();
      seen.add(key);
      items.push({ key, label });
    }
    if (items.length === 0) continue;
    let gk = typeof g?.key === 'string' && g.key ? g.key : `g${out.length + 1}`;
    if (out.some((x) => x.key === gk)) gk = `${gk}_${out.length + 1}`;
    out.push({ key: gk, title: String(g?.title ?? '').trim() || `分组${out.length + 1}`, items });
  }
  return out;
}
