/**
 * 纸质《产妇常规护理计划》统计表（一直沿用、每天往上写新记录）的拍照识别说明书。
 * 一张表一次性读出所有已写的记录（护理项目的日期/打勾/血压体重，宣教项目的日期和签名），
 * 系统再和已登记的服务执行记录比对，只把“新写的”拿出来让人确认登记。
 */
import { FieldSpec, date, dec, int, o, single, text } from '../care-assessment/assessment-specs';
import { LEVEL_STANDARDS } from './care-standards';

/** 纸上每一行的印刷名称 → 系统里的服务项目代码（给 AI 看，也用来在界面上显示项目名） */
const SHEET_ROW_LABEL: Record<string, string> = {
  BP: '血压（入所三天内，1次/日）',
  WEIGHT: '体重记录（kg，每周一次）',
  PERINEAL: '会阴护理',
  PHYSIO: '理疗护理',
  UTERUS_MASSAGE: '按摩子宫护理',
  ROUND_NEWBORN: '新生儿查房',
  ROUND_OB: '产科查房',
  ROUND_NUTRITION: '营养师查房',
  ROUND_RECOVERY: '产康查房',
  HAIR_WASH: '中药水洗头',
  FOOT_SOAK: '中药水泡脚',
  EDU_ADMISSION: '入所宣教',
  EDU_DIET: '产妇饮食指导',
  EDU_CHOKING: '新生儿呛奶急救',
  EDU_BREASTFEED: '母乳喂养及拍嗝',
  EDU_HOLD: '新生儿抱姿',
  EDU_DIAPER: '更换纸尿裤',
  EDU_GAS: '新生儿排气操',
  EDU_PASSIVE: '新生儿被动操',
  EDU_BATH: '新生儿洗澡',
  EDU_TOUCH: '新生儿抚触',
  EDU_DISCHARGE: '出所健康指导',
};

/** 纸表上有的服务项目（顺序同纸表）；床品更换、宝宝洗澡/游泳不在这张纸上 */
export const SHEET_SERVICE_CODES = Object.keys(SHEET_ROW_LABEL);

export const sheetRowLabel = (code: string) => SHEET_ROW_LABEL[code] ?? code;

const nameOf = (code: string) => LEVEL_STANDARDS.LEVEL3.services.find((s) => s.code === code)?.name ?? code;

/** 表头：用来核对“拍的是不是这位妈妈的表” */
export const SHEET_HEADER_FIELDS: FieldSpec[] = [
  text('patientName', '姓名', { aiHint: '表头“姓名”栏手写的名字' }),
  date('checkInDate', '入所时间', { aiHint: '表头“入所时间”，常写成 10/10（日/月），补成完整日期' }),
];

/** 记录表：每个已经写了的日期/打勾，一行 */
export const SHEET_ENTRY_COLUMNS: FieldSpec[] = [
  single('serviceCode', '项目', SHEET_SERVICE_CODES.map((c) => o(c, sheetRowLabel(c))), { aiHint: '这条记录写在纸上哪一行（填项目代码）' }),
  date('date', '日期', { aiHint: '这次做的日期，补成 YYYY-MM-DD。“11/10”这类是 日/月（11 日 10 月），不是 月/日' }),
  text('time', '时间', { hint: 'HH:mm', aiHint: '纸上写了具体时间才填，没写就留空' }),
  int('systolic', '收缩压(高压)', { unit: 'mmHg', min: 60, max: 260, aiHint: '仅血压行：145/95mmHg 里的 145' }),
  int('diastolic', '舒张压(低压)', { unit: 'mmHg', min: 30, max: 160, aiHint: '仅血压行：145/95mmHg 里的 95' }),
  dec('weightKg', '体重(kg)', { unit: 'kg', min: 30, max: 200, aiHint: '仅体重行；如果写的是斤（如 136 斤）请换算成公斤填，拿不准就原样填数字并放进 unclear_fields' }),
  text('doneByName', '护理员', { aiHint: '“护理员签名”栏手写的名字（宣教项目才有）' }),
  single('clientSigned', '客户已签', [o('YES', '已签')], { aiHint: '“客户签名”栏有签字就填 YES，没签留空' }),
];

export const SHEET_AI_DESCRIPTION =
  '《产妇常规护理计划》统计表，一页纸，整个入住期间一直在这张表上累积记录：' +
  '上半部分是“护理项目”表格——每行一个项目（血压、体重记录、会阴护理、理疗护理、按摩子宫护理、新生儿查房、产科查房、营养师查房、产康查房、中药水洗头、中药水泡脚），' +
  '右边横向的格子里依次手写着做过的日期（常写成“11/10 ✓”，意思是 11 日（10 月）做了一次并打勾），血压行和体重行还手写着数值（如 10/10 145/95mmHg）；' +
  '下半部分是“宣教项目”表格——每行一个宣教内容（入所宣教、产妇饮食指导、新生儿呛奶急救、母乳喂养及拍嗝、新生儿抱姿、更换纸尿裤、新生儿排气操、新生儿被动操、新生儿洗澡、新生儿抚触、出所健康指导），' +
  '后面三栏是宣教时间（如 2026.10.10）、护理员签名、客户签名。' +
  '请把【所有已经写了的记录】逐条读出来放进 entries：每个日期/每次打勾 = 1 行；同一天同一项目写了几次就输出几行；没写内容的空格、没写的行一律不要输出。' +
  '日期格式很重要：纸上“13/10”是 日/月（10 月 13 日），年份没写就用今年。' +
  '血压行、体重行如果只写了日期、后面还没有写数值，说明只是预约的日期，还没有测，不要输出这种行（只输出写了数值的）。' +
  '“共 3 次”“共____次”这类印刷的次数统计、“产科查房 共__次”等空白栏不是记录，不要当成记录。';

export function serviceSheetAiSpec() {
  const slim = (f: FieldSpec) => ({ key: f.key, label: f.label, kind: f.kind, options: f.options, unit: f.unit, min: f.min, max: f.max, aiHint: f.aiHint });
  return {
    formTitle: '产妇常规护理计划（统计表）',
    description: SHEET_AI_DESCRIPTION,
    fields: [...SHEET_HEADER_FIELDS.map(slim), { key: 'entries', label: '已记录的服务项目', kind: 'table', columns: SHEET_ENTRY_COLUMNS.map(slim) }],
  };
}

export { nameOf as serviceNameOf };
