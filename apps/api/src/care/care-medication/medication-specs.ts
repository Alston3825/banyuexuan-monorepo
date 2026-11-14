/**
 * 《新生儿用药服药喂药委托书》字段说明书。
 * 一份委托书 = 表头（委托日期/用药日期/签字人）+ 多行药品。纸上没有、系统里补的字段：
 * 剂量、疗程（天数/起止日期）、变更说明（新一份相对上一份变了什么）。
 */
import { date, dec, int, longtext, multi, o, single, text, FieldSpec } from '../care-assessment/assessment-specs';

export const MED_HEADER_FIELDS: FieldSpec[] = [
  date('authDate', '委托日期'),
  date('medicationStart', '用药日期', { aiHint: '“用药日期”后手写的日期；年份缺省按今年补全' }),
  text('signerName', '宝妈或家属签字', { aiHint: '底部“宝妈或家属（签字）”处的手写姓名；字迹难辨尽力辨认' }),
  text('nurseName', '护理师签字', { aiHint: '底部“护理师（签字）”处的手写姓名' }),
  longtext('remark', '备注'),
];

export const MED_ITEM_COLUMNS: FieldSpec[] = [
  text('drugName', '药名', { aiHint: '“药名”栏手写的药品名称，常是简称或字母（如 AD、D3）；原样抄写' }),
  single('route', '用法', [o('ORAL', '内服'), o('EXTERNAL', '外用')], { aiHint: '“用法”栏下“内服/外用”两列，打勾的那一列' }),
  multi('times', '服药时间', [o('MORNING', '早'), o('NOON', '中'), o('EVENING', '晚')], { aiHint: '“服药时间”栏下“早/中/晚”三列，打勾的列（可多选）' }),
  text('dose', '剂量', { aiHint: '纸质表上一般没有这一栏，读不到就填 null，不要猜' }),
  int('courseDays', '疗程(天)', { min: 1, max: 90, aiHint: '纸质表上一般没有，读不到就填 null' }),
  date('startDate', '开始日期'),
  date('endDate', '结束日期'),
  text('notes', '用药注意事项', { aiHint: '“用药注意事项”栏手写内容，如饭前饭后、间隔时长' }),
  single('familySigned', '家长签名', [o('YES', '已签')], { aiHint: '该行“家长签名”栏有签名就填 YES，没有填 null' }),
];

export const MED_AI_DESCRIPTION =
  '《新生儿用药服药喂药委托书》：家长委托护理师给宝宝服药。上方是妈妈姓名、房间号、用药日期、委托日期（手写），中间是药品表格（药名、用法内服/外用、服药时间早/中/晚、用药注意事项、家长签名，多行，没写的行是空行），' +
  '底部是宝妈或家属签字、护理师签字。印刷表格，手写和打钩。';

export const MED_ROUTE_LABEL: Record<string, string> = { ORAL: '内服', EXTERNAL: '外用' };
export const MED_TIME_LABEL: Record<string, string> = { MORNING: '早', NOON: '中', EVENING: '晚' };

export { dec };
