/**
 * 三级护理标准（草案）：三级（常规）= 《会所入住宣教》里写明的标准频次；二级、一级在其基础上加密。
 * ⚠ 一级/二级的频次是系统先拟的草稿，需要护理主任审定后再调整（见待完善清单）；三级照宣教原文。
 * 服务项目对应纸质《产妇常规护理计划》上的“护理项目”和“宣教项目”，每做一次在“服务执行”里记一条。
 */
export type LevelCode = 'LEVEL1' | 'LEVEL2' | 'LEVEL3';

/** 应做频次 */
export type Freq =
  | { kind: 'DAILY'; days?: number } // 每天一次；days = 只在入住前 N 天
  | { kind: 'DAILY_TIMES'; times: number; days: number } // 前 N 天每天 times 次
  | { kind: 'EVERY_N_DAYS'; n: number } // 每 n 天一次
  | { kind: 'WEEKLY'; afterDay?: number; perWeek?: number } // 每周 perWeek 次（默认 1），afterDay = 第几天之后才开始
  | { kind: 'ONCE' } // 入住期间一次（宣教项目）
  | { kind: 'AS_NEEDED' }; // 按恢复情况安排，不算应做次数

export interface ServiceStd {
  code: string;
  name: string;
  subject: 'MOTHER' | 'BABY';
  group: 'ITEM' | 'EDU'; // 护理项目 / 宣教项目
  freq: Freq;
}

/**
 * 需要记录数值的服务项目（其余项目只记日期+时间）。
 * BP = 收缩压/舒张压（mmHg），WEIGHT = 体重（kg）。
 */
export type MeasureKind = 'BP' | 'WEIGHT';
export const SERVICE_MEASURE: Record<string, MeasureKind> = { BP: 'BP', WEIGHT: 'WEIGHT' };

export const LEVEL_LABEL: Record<LevelCode, string> = { LEVEL1: '一级（重点）', LEVEL2: '二级', LEVEL3: '三级（常规）' };

const m = (code: string, name: string, freq: Freq, group: 'ITEM' | 'EDU' = 'ITEM'): ServiceStd => ({ code, name, subject: 'MOTHER', group, freq });
const b = (code: string, name: string, freq: Freq, group: 'ITEM' | 'EDU' = 'ITEM'): ServiceStd => ({ code, name, subject: 'BABY', group, freq });

/** 宣教项目：每个都要做一次并让客户签字（三个等级一样） */
const EDU: ServiceStd[] = [
  m('EDU_ADMISSION', '入所宣教', { kind: 'ONCE' }, 'EDU'),
  m('EDU_DIET', '产妇饮食指导', { kind: 'ONCE' }, 'EDU'),
  b('EDU_CHOKING', '新生儿呛奶急救', { kind: 'ONCE' }, 'EDU'),
  b('EDU_BREASTFEED', '母乳喂养及拍嗝', { kind: 'ONCE' }, 'EDU'),
  b('EDU_HOLD', '新生儿抱姿', { kind: 'ONCE' }, 'EDU'),
  b('EDU_DIAPER', '更换纸尿裤', { kind: 'ONCE' }, 'EDU'),
  b('EDU_GAS', '新生儿排气操', { kind: 'ONCE' }, 'EDU'),
  b('EDU_PASSIVE', '新生儿被动操', { kind: 'ONCE' }, 'EDU'),
  b('EDU_BATH', '新生儿洗澡', { kind: 'ONCE' }, 'EDU'),
  b('EDU_TOUCH', '新生儿抚触', { kind: 'ONCE' }, 'EDU'),
  m('EDU_DISCHARGE', '出所健康指导', { kind: 'ONCE' }, 'EDU'),
];

const L3: ServiceStd[] = [
  m('BP', '产妇血压', { kind: 'DAILY', days: 3 }), // 宣教：入所前三天每日 1 次
  m('WEIGHT', '产妇体重', { kind: 'WEEKLY' }), // 宣教：每周 1 次
  m('PERINEAL', '会阴护理', { kind: 'AS_NEEDED' }), // 宣教：根据产妇恢复情况安排
  m('PHYSIO', '理疗护理（红光治疗仪）', { kind: 'AS_NEEDED' }),
  m('UTERUS_MASSAGE', '按摩子宫护理', { kind: 'AS_NEEDED' }),
  m('ROUND_NEWBORN', '新生儿查房（儿科专家）', { kind: 'WEEKLY' }), // 宣教：专家查房每周 1 次
  m('ROUND_OB', '产科查房', { kind: 'WEEKLY' }),
  m('ROUND_NUTRITION', '营养师查房', { kind: 'WEEKLY' }),
  m('ROUND_RECOVERY', '产康查房', { kind: 'WEEKLY' }),
  m('HAIR_WASH', '中药水洗头', { kind: 'WEEKLY', afterDay: 14 }), // 宣教：产后 14 天后每周 1 次
  m('FOOT_SOAK', '中药水泡脚', { kind: 'WEEKLY', afterDay: 10 }), // 宣教：产后 10 天后每周 1 次
  m('BEDDING', '床品更换', { kind: 'WEEKLY' }), // 宣教：床品每周更换一次
  b('BABY_BATH', '宝宝洗澡', { kind: 'EVERY_N_DAYS', n: 2 }), // 宣教：隔天 1 次
  b('BABY_SWIM', '宝宝游泳（脐带脱落后）', { kind: 'WEEKLY' }), // 宣教：每周 1 次
];

const override = (list: ServiceStd[], patch: Record<string, Freq>): ServiceStd[] => list.map((s) => (patch[s.code] ? { ...s, freq: patch[s.code] } : s));

/** 二级：在三级基础上加密（草案） */
const L2 = override(L3, {
  BP: { kind: 'DAILY', days: 7 },
  WEIGHT: { kind: 'WEEKLY', perWeek: 2 },
  PERINEAL: { kind: 'DAILY', days: 14 },
  UTERUS_MASSAGE: { kind: 'DAILY', days: 7 },
  BABY_BATH: { kind: 'DAILY' },
});

/** 一级：重点监护（草案）。妊娠高血压的妈妈入所前三天每天测血压 3 次（纸质表备注） */
const L1 = override(L2, {
  BP: { kind: 'DAILY_TIMES', times: 3, days: 3 },
  WEIGHT: { kind: 'WEEKLY', perWeek: 3 },
  ROUND_NEWBORN: { kind: 'WEEKLY', perWeek: 2 },
  ROUND_OB: { kind: 'WEEKLY', perWeek: 2 },
});

export const LEVEL_STANDARDS: Record<LevelCode, { label: string; desc: string; services: ServiceStd[] }> = {
  LEVEL3: { label: LEVEL_LABEL.LEVEL3, desc: '身体情况稳定的常规护理，频次按《会所入住宣教》执行', services: [...L3, ...EDU] },
  LEVEL2: { label: LEVEL_LABEL.LEVEL2, desc: '有一定问题需要加密观察（草案，待护理主任审定）', services: [...L2, ...EDU] },
  LEVEL1: { label: LEVEL_LABEL.LEVEL1, desc: '存在较重问题、重点监护（草案，待护理主任审定）', services: [...L1, ...EDU] },
};

export function freqText(f: Freq): string {
  switch (f.kind) {
    case 'DAILY':
      return f.days ? `入所前 ${f.days} 天每天 1 次` : '每天 1 次';
    case 'DAILY_TIMES':
      return `入所前 ${f.days} 天每天 ${f.times} 次`;
    case 'EVERY_N_DAYS':
      return `每 ${f.n} 天 1 次`;
    case 'WEEKLY':
      return `${f.afterDay ? `入所第 ${f.afterDay} 天后` : ''}每周 ${f.perWeek ?? 1} 次`;
    case 'ONCE':
      return '入住期间 1 次（客户签字）';
    case 'AS_NEEDED':
      return '按恢复情况安排';
  }
}

/** 入住第 stayDay 天（从 1 开始）时，按标准累计应做几次；AS_NEEDED 返回 null。 */
export function expectedCount(f: Freq, stayDay: number): number | null {
  if (stayDay < 1) return 0;
  switch (f.kind) {
    case 'DAILY':
      return Math.min(stayDay, f.days ?? stayDay);
    case 'DAILY_TIMES':
      return Math.min(stayDay, f.days) * f.times;
    case 'EVERY_N_DAYS':
      return Math.floor((stayDay - 1) / f.n) + 1;
    case 'WEEKLY': {
      const per = f.perWeek ?? 1;
      const d = f.afterDay ?? 0;
      return stayDay <= d ? 0 : (Math.floor((stayDay - d - 1) / 7) + 1) * per;
    }
    case 'ONCE':
      return 1;
    case 'AS_NEEDED':
      return null;
  }
}

export const allServiceCodes = (): Set<string> => new Set(Object.values(LEVEL_STANDARDS).flatMap((l) => l.services.map((s) => s.code)));
