/**
 * 四张"单次评估"纸质表的字段说明书（单一来源）。
 * - 后端按它校验、入库（每个字段在数据库里是独立的列，方便筛选统计）；
 * - 前端按它自动生成录入/复核表单（GET /care/assessments/specs）；
 * - AI 识别按它生成提示词（字段 key = 识别结果的 key = 入库字段名，三边一致）。
 * 改字段时：改这里 + 在 schema.prisma 里加/改对应的列（见 scripts 里的生成脚本）+ 写迁移。
 * 单选/多选的取值存的是英文代码（value），页面显示中文（label）。
 */
export type AssessmentType = 'MOTHER_ADMISSION' | 'BABY_ADMISSION' | 'MOTHER_DISCHARGE' | 'BABY_DISCHARGE';
export const ASSESSMENT_TYPES: AssessmentType[] = ['MOTHER_ADMISSION', 'BABY_ADMISSION', 'MOTHER_DISCHARGE', 'BABY_DISCHARGE'];

export type FieldKind = 'text' | 'longtext' | 'int' | 'decimal' | 'date' | 'single' | 'multi';

export interface Opt {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  options?: Opt[];
  unit?: string;
  /** 数值的合理范围；超出时不拦截保存，只在录入页和 AI 复核里提醒（防止少打/多打一位） */
  min?: number;
  max?: number;
  hint?: string;
  /** 给 AI 看的补充说明（纸上这个栏位长什么样、怎么填） */
  aiHint?: string;
}

export interface GroupSpec {
  title: string;
  fields: FieldSpec[];
}

export interface FormSpec {
  type: AssessmentType;
  title: string;
  /** 这张表属于妈妈还是宝宝档案 */
  subject: 'MOTHER' | 'BABY';
  /** 对应的 Prisma 委托名（prisma[model]） */
  model: 'careMotherAdmission' | 'careBabyAdmission' | 'careMotherDischarge' | 'careBabyDischarge';
  /** 给 AI 看的整张表的描述 */
  aiDescription: string;
  groups: GroupSpec[];
}

export const o = (value: string, label: string): Opt => ({ value, label });
export const YES_NO = [o('YES', '有'), o('NO', '无')];
export const NORMAL_ABNORMAL = [o('NORMAL', '正常'), o('ABNORMAL', '异常')];
const DELIVERY = [o('VAGINAL', '顺产'), o('CESAREAN', '剖腹产'), o('VAGINAL_TO_CESAREAN', '顺转剖')];
export const LOCHIA_AMOUNT = [o('MANY', '量多'), o('MEDIUM', '量中'), o('FEW', '量少'), o('NONE', '无')];
export const LOCHIA_COLOR = [o('BRIGHT_RED', '鲜艳/暗红'), o('PINK', '粉红'), o('BROWN', '褐色'), o('LIGHT_BROWN', '浅褐色'), o('WHITE_YELLOW', '白色淡黄色')];
export const LOCHIA_ODOR = [o('NONE', '无异味'), o('FOUL', '腥臭味')];
const NIPPLE = [o('NORMAL', '正常'), o('DEPRESSED', '凹陷'), o('FLAT', '短平'), o('CRACKED', '皲裂'), o('WHITE_BLISTER', '白点、白泡')];

export const text = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'text', ...extra });
export const longtext = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'longtext', ...extra });
export const int = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'int', ...extra });
export const dec = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'decimal', ...extra });
export const date = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'date', ...extra });
export const single = (key: string, label: string, options: Opt[], extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'single', options, ...extra });
export const multi = (key: string, label: string, options: Opt[], extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, kind: 'multi', options, ...extra });

const vitals = (): FieldSpec[] => [
  dec('temperature', '体温', { unit: '℃', min: 35, max: 40 }),
  int('pulse', '脉搏', { unit: '次/分', min: 40, max: 180 }),
  int('respiration', '呼吸', { unit: '次/分', min: 8, max: 40 }),
  int('bpSystolic', '收缩压(高压)', { unit: 'mmHg', min: 70, max: 220, aiHint: '血压写成 114/80 时，114 是收缩压、80 是舒张压' }),
  int('bpDiastolic', '舒张压(低压)', { unit: 'mmHg', min: 40, max: 140 }),
];

const motherAdmission: FormSpec = {
  type: 'MOTHER_ADMISSION',
  title: '产妇入住评估单',
  subject: 'MOTHER',
  model: 'careMotherAdmission',
  aiDescription: '《产妇入住评估单》：入住当天对产妇做的评估，印刷表格，护理师手写和打钩。',
  groups: [
    {
      title: '基本信息',
      fields: [
        int('age', '年龄', { unit: '岁', min: 14, max: 60 }),
        text('gestationalWeeks', '孕周', { hint: '如 40+4', aiHint: '原样抄写，如 40+4、39' }),
        single('bloodType', '血型', [o('A', 'A'), o('B', 'B'), o('AB', 'AB'), o('O', 'O'), o('UNKNOWN', '不详')]),
        text('deliveryHospital', '分娩医院'),
        date('admissionDate', '入所日期'),
        date('deliveryDate', '分娩日期'),
        single('deliveryMethod', '分娩方式', DELIVERY),
        dec('heightCm', '身高', { unit: 'cm', min: 130, max: 190 }),
        dec('weightKg', '体重', { unit: 'kg', min: 35, max: 130 }),
      ],
    },
    {
      title: '病史',
      fields: [
        text('chiefComplaint', '主诉'),
        single('allergyHistory', '过敏史', YES_NO),
        text('allergyNote', '过敏说明'),
        text('pastHistory', '既往病史'),
        text('pregnancyComplications', '孕期合并症'),
        text('abnormalDeliveryReason', '异常生产原因'),
        single('hemorrhoids', '痔疮', [o('NONE', '无'), o('INTERNAL', '内痔'), o('EXTERNAL', '外痔'), o('MIXED', '混合痔')]),
      ],
    },
    { title: '生命体征', fields: vitals() },
    {
      title: '腹部与产科',
      fields: [
        dec('fundusFingersBelowNavel', '子宫高度：脐下几指', { unit: '指', min: 0, max: 6 }),
        text('uterineContraction', '宫缩情况'),
        single('breast', '乳房', NORMAL_ABNORMAL),
        text('breastNote', '乳房异常说明'),
        single('nipple', '乳头', NORMAL_ABNORMAL),
        text('nippleNote', '乳头异常说明'),
        multi('perineum', '会阴', [o('TEAR_INCISION', '撕裂/侧切'), o('EDEMA', '水肿'), o('OTHER', '其他')]),
        text('perineumNote', '会阴其他说明'),
        multi('woundDressing', '剖宫产腹部伤口敷料', [o('INTACT', '完整'), o('DRY', '干燥'), o('EXUDATE', '渗出')]),
        text('dressingNote', '敷料备注', { hint: '如 3-5 天', aiHint: '“伤口敷料”旁边手写的天数提示，如 3-5天' }),
        single('lochiaColor', '恶露颜色', LOCHIA_COLOR, { aiHint: '“恶露情况—性质”栏，如 淡红 对应 PINK' }),
        single('lochiaAmount', '恶露量', LOCHIA_AMOUNT),
        single('lochiaOdor', '恶露气味', LOCHIA_ODOR),
      ],
    },
    {
      title: '其他',
      fields: [
        single('legEdema', '下肢水肿', [o('NONE', '无'), o('MILD', '轻'), o('MODERATE', '中'), o('SEVERE', '重')], { aiHint: '“下肢水肿”只有 轻/中/重 三个框，都没勾则为 NONE' }),
        single('nightSweat', '盗汗', YES_NO),
        text('dietTaboo', '饮食禁忌'),
        longtext('handlingNotes', '处理', { aiHint: '底部“处理”大框里的手写条目（1. 2. 3. …），按行抄写，每条一行' }),
      ],
    },
    {
      title: '签名',
      fields: [text('assessorName', '评估人员'), text('responsibleNurseName', '责任护士'), text('clientSignerName', '宝妈或家属签字'), date('assessedAt', '评估日期')],
    },
  ],
};

const babyAdmission: FormSpec = {
  type: 'BABY_ADMISSION',
  title: '新生儿入所评估',
  subject: 'BABY',
  model: 'careBabyAdmission',
  aiDescription: '《新生儿入所评估》：宝宝入住当天的全身评估，印刷表格，护理师手写和打钩。',
  groups: [
    {
      title: '基本信息',
      fields: [
        text('gestationalWeeks', '孕周', { hint: '如 40+4' }),
        date('admissionDate', '入所日期'),
        single('mentalState', '精神状况', [o('GOOD', '好'), o('FAIR', '一般'), o('POOR', '差')]),
        single('birthMethod', '出生方式', DELIVERY),
        int('birthWeightG', '出生体重', { unit: 'g', min: 1000, max: 6000, aiHint: '换算成克，如 3750g 填 3750；写 3.75kg 也要换成 3750' }),
        dec('birthLengthCm', '出生身长', { unit: 'cm', min: 35, max: 65 }),
        int('admissionWeightG', '入所体重', { unit: 'g', min: 1000, max: 7000, aiHint: '换算成克' }),
        dec('admissionLengthCm', '入所身长', { unit: 'cm', min: 35, max: 70 }),
        dec('headCircumferenceCm', '入所头围', { unit: 'cm', min: 28, max: 42 }),
        dec('chestCircumferenceCm', '入所胸围', { unit: 'cm', min: 25, max: 45 }),
        dec('temperature', '入所体温', { unit: '℃', min: 35, max: 40 }),
        single('breastCondition', '乳房情况', NORMAL_ABNORMAL),
      ],
    },
    {
      title: '生殖器官',
      fields: [
        single('testis', '男：睾丸', [o('DESCENDED', '已降'), o('NOT_DESCENDED', '未降')]),
        single('hydrocele', '男：鞘膜积液', YES_NO),
        single('urethraMale', '男：尿道', [o('NORMAL', '正常'), o('RED_SWOLLEN', '红肿')]),
        single('labiaDevelopment', '女：阴蒂阴唇发育', NORMAL_ABNORMAL),
        text('labiaNote', '女：发育异常说明'),
        single('vaginalDischarge', '女：阴道分泌物', YES_NO),
        text('vaginalDischargeNote', '女：分泌物说明'),
        single('urethraFemale', '女：尿道', NORMAL_ABNORMAL),
        text('urethraFemaleNote', '女：尿道异常说明'),
      ],
    },
    {
      title: '全身检查',
      fields: [
        single('head', '头部', [o('NORMAL', '正常'), o('HEMATOMA', '血肿')]),
        multi('skin', '皮肤', [o('DRY', '干燥'), o('NORMAL', '正常'), o('RASH', '红疹'), o('DAMAGED', '皮损')]),
        text('fontanelle', '前囟'),
        text('facialFeatures', '五官'),
        text('oralCavity', '口腔'),
        single('hearingScreening', '听力筛查', [o('PASS', '通过'), o('FAIL', '未通过')]),
        text('neck', '颈部'),
        text('anus', '肛门'),
        text('lungs', '肺部'),
        single('heart', '心脏', NORMAL_ABNORMAL),
        text('heartNote', '心脏异常原因'),
        text('abdomen', '腹部'),
        single('limbs', '四肢活动', NORMAL_ABNORMAL),
        text('limbsNote', '四肢异常原因'),
        single('umbilicalStatus', '脐带', [o('DRY_STUMP', '干结'), o('FALLEN', '脱落')]),
        multi('umbilicalAbnormal', '脐带异常', [o('BLEEDING', '渗血'), o('OOZING', '渗液'), o('ODOR', '异味'), o('RED', '红'), o('SWOLLEN', '肿')]),
        single('buttocks', '臀部', [o('NORMAL', '正常'), o('DIAPER_RASH', '尿布疹'), o('DAMAGED', '皮损'), o('OTHER', '其它')]),
      ],
    },
    {
      title: '疫苗与筛查',
      fields: [
        single('hepB', '乙肝疫苗已接种', [o('YES', '是'), o('NO', '否')]),
        single('bcg', '卡介苗已接种', [o('YES', '是'), o('NO', '否')]),
        text('vaccineReason', '未接种原因'),
        dec('jaundiceForehead', '黄疸值-前额', { min: 0, max: 30, aiHint: '“入所时黄疸值”栏，三个数字分别对应 前额、眼角、前胸' }),
        dec('jaundiceCanthus', '黄疸值-眼角', { min: 0, max: 30 }),
        dec('jaundiceChest', '黄疸值-前胸', { min: 0, max: 30 }),
        single('pku', 'PKU足底血已采', [o('YES', '是'), o('NO', '否')]),
        text('pkuReason', '未采原因'),
      ],
    },
    {
      title: '喂养',
      fields: [
        single('feedingMethod', '喂养方式', [o('BREAST', '母乳喂养'), o('MIXED', '混合喂养'), o('FORMULA', '人工喂养')]),
        int('formulaMl', '人工喂养每次奶量', { unit: 'ml', min: 10, max: 200 }),
        single('feedingStatus', '吃奶情况', [o('GOOD', '好'), o('FAIR', '一般'), o('POOR', '差')]),
        multi('feedingIssues', '吐奶/呛奶', [o('SPIT_UP', '吐奶'), o('CHOKING', '呛奶')]),
        longtext('specialNotes', '特殊情况', { aiHint: '底部“特殊情况”大框里的手写条目，按行抄写，每条一行' }),
      ],
    },
    {
      title: '签名',
      fields: [text('assessorName', '评估人员'), text('responsibleNurseName', '责护'), text('clientSignerName', '宝妈或家属签字'), date('assessedAt', '评估日期')],
    },
  ],
};

const motherDischarge: FormSpec = {
  type: 'MOTHER_DISCHARGE',
  title: '妈妈出所健康评估表',
  subject: 'MOTHER',
  model: 'careMotherDischarge',
  aiDescription: '《妈妈出所健康评估表》：离店前对妈妈做的 17 项评估，印刷表格，护理师手写数字和打钩。',
  groups: [
    {
      title: '基本信息',
      fields: [date('admissionDate', '入住日期'), date('dischargeDate', '出所日期'), int('age', '年龄', { unit: '岁', min: 14, max: 60 })],
    },
    { title: '1 生命体征', fields: vitals() },
    {
      title: '2-3 形态与子宫',
      fields: [
        dec('heightCm', '身高', { unit: 'cm', min: 130, max: 190 }),
        dec('weightKg', '体重', { unit: 'kg', min: 35, max: 130 }),
        single('fundus', '子宫恢复', [o('NOT_IN_PELVIS', '未入盆'), o('IN_PELVIS', '已入盆')]),
        dec('fundusFingersBelowNavel', '未入盆：脐下几指', { unit: '指', min: 0, max: 6 }),
      ],
    },
    {
      title: '4-7 恶露',
      fields: [
        single('lochiaAmount', '恶露量', LOCHIA_AMOUNT),
        single('lochiaColor', '颜色', LOCHIA_COLOR),
        single('lochiaProperty', '性状', [o('THIN', '稀薄'), o('STICKY', '粘稠'), o('CLOTS', '血块')]),
        single('lochiaOdor', '味道', LOCHIA_ODOR),
      ],
    },
    {
      title: '8-13 伤口与乳房',
      fields: [
        multi('woundSite', '伤口部位', [o('PERINEUM', '会阴伤口'), o('ABDOMEN', '腹部伤口')]),
        multi('woundStatus', '伤口情况', [o('NORMAL', '正常'), o('RED_SWOLLEN', '红肿'), o('BLEEDING', '渗血'), o('OOZING', '渗液'), o('SUTURE_REJECTION', '线头排异')]),
        multi('breastStatus', '乳房', [o('SOFT', '柔软'), o('SWOLLEN', '肿胀'), o('LUMP', '硬块'), o('PAIN', '疼痛'), o('SKIN_DAMAGE', '皮肤破损')]),
        multi('leftNipple', '左侧乳头', NIPPLE),
        multi('rightNipple', '右侧乳头', NIPPLE),
        single('milkSecretion', '乳汁分泌', [o('NONE', '无'), o('LITTLE', '少量'), o('MEDIUM', '中量'), o('MUCH', '量多')]),
        single('hemorrhoids', '痔疮', YES_NO),
        text('hemorrhoidsNote', '痔疮说明'),
      ],
    },
    {
      title: '14-17 其他',
      fields: [
        single('bowel', '排便情况', NORMAL_ABNORMAL),
        single('mentalState', '精神状态', [o('NORMAL', '正常'), o('POOR', '欠佳'), o('TIRED', '疲倦'), o('WEAK', '虚弱')]),
        multi('edema', '水肿情况', [o('NORMAL', '正常'), o('LEG', '下肢'), o('FACE', '脸部')]),
        longtext('otherSpecial', '其他特殊情况'),
        longtext('dischargeTips', '出所温馨提示'),
      ],
    },
    { title: '签名', fields: [text('assessorName', '评估人员'), date('assessedAt', '评估日期')] },
  ],
};

const babyDischarge: FormSpec = {
  type: 'BABY_DISCHARGE',
  title: '宝宝出所健康评估表',
  subject: 'BABY',
  model: 'careBabyDischarge',
  aiDescription: '《宝宝出所健康评估表》：离店前对宝宝做的 9 项评估，印刷表格，护理师手写数字和打钩。',
  groups: [
    {
      title: '基本信息',
      fields: [int('ageDays', '日龄', { unit: '天', min: 0, max: 200 }), date('admissionDate', '入所日期'), date('dischargeDate', '出所日期')],
    },
    {
      title: '1 一般测量',
      fields: [
        dec('temperature', '体温', { unit: '℃', min: 35, max: 40 }),
        int('respiration', '呼吸', { unit: '次/分', min: 20, max: 80 }),
        dec('admissionLengthCm', '入所身长', { unit: 'cm', min: 35, max: 70 }),
        dec('dischargeLengthCm', '出所身长', { unit: 'cm', min: 40, max: 90 }),
        int('admissionWeightG', '入所体重', { unit: 'g', min: 1000, max: 7000, aiHint: '单位是克，如 3790；写成 3.79kg 要换成 3790' }),
        int('dischargeWeightG', '出所体重', { unit: 'g', min: 2000, max: 12000, aiHint: '单位是克，如 4930；写成 4.93kg 要换成 4930' }),
        dec('admissionHeadCm', '入所头围', { unit: 'cm', min: 28, max: 42 }),
        dec('dischargeHeadCm', '出所头围', { unit: 'cm', min: 30, max: 48 }),
      ],
    },
    {
      title: '2 皮肤情况',
      fields: [
        dec('admissionJaundiceForehead', '入所黄疸-前额', { min: 0, max: 30, aiHint: '“黄疸值”行：入所三个数（前额、眼角、前胸），出所三个数（前额、眼角、前胸）' }),
        dec('admissionJaundiceCanthus', '入所黄疸-眼角', { min: 0, max: 30 }),
        dec('admissionJaundiceChest', '入所黄疸-前胸', { min: 0, max: 30 }),
        dec('dischargeJaundiceForehead', '出所黄疸-前额', { min: 0, max: 30 }),
        dec('dischargeJaundiceCanthus', '出所黄疸-眼角', { min: 0, max: 30 }),
        dec('dischargeJaundiceChest', '出所黄疸-前胸', { min: 0, max: 30 }),
        text('rash', '皮疹'),
        text('redButtocks', '红臀'),
      ],
    },
    {
      title: '3 头面部',
      fields: [
        text('headFinding', '头部'),
        text('face', '面部'),
        text('sclera', '巩膜'),
        text('eyeSecretion', '眼部分泌物'),
        single('ear', '耳部', [o('NORMAL', '正常'), o('DISCHARGE', '分泌物')]),
        text('earNote', '耳部其他'),
        text('oralCavity', '口腔'),
        text('mucosa', '粘膜'),
        text('throat', '咽'),
        text('tongue', '舌'),
        single('neck', '颈部', [o('SOFT', '软'), o('RESIST', '抵抗'), o('RIGID', '强制'), o('OTHER', '其他')]),
      ],
    },
    {
      title: '4-9 其他部位',
      fields: [
        single('feedingMethod', '喂养', [o('FORMULA', '人工喂养'), o('BREAST', '母乳喂养'), o('MIXED', '混合喂养')]),
        single('breastRedSwollen', '胸部乳房红肿', YES_NO),
        multi('umbilical', '脐部', [o('FALLEN', '已脱'), o('NOT_FALLEN', '未脱'), o('OOZING', '渗液'), o('RED_SWOLLEN', '红肿'), o('OTHER', '其他')]),
        text('umbilicalNote', '脐部其他说明'),
        single('testis', '男孩：睾丸', [o('DESCENDED', '已降'), o('NOT_DESCENDED', '未降')]),
        multi('maleFindings', '男孩：其他', [o('HYDROCELE', '鞘膜积液'), o('SCROTAL_FOLDS', '阴囊皱襞'), o('URETHRAL_RED', '尿道口红肿')]),
        text('labiaDevelopment', '女孩：阴蒂阴唇发育'),
        text('vaginalDischarge', '女孩：阴道分泌物'),
        text('urethraOpening', '女孩：尿道口'),
        text('otherMalformation', '其他畸形'),
        single('anus', '肛门', [o('NORMAL', '无异常'), o('MALFORMED', '畸形'), o('OTHER', '其他')]),
        text('anusNote', '肛门说明'),
        single('spineLimbs', '脊柱四肢', [o('NORMAL', '无异常'), o('MALFORMED', '畸形'), o('TONE', '四肢活动和张力')]),
        text('spineLimbsNote', '脊柱四肢说明'),
        longtext('dischargeTips', '出所温馨提示'),
      ],
    },
    { title: '签名', fields: [text('assessorName', '护理师'), text('clientSignerName', '宝妈或家属签字'), date('assessedAt', '评估日期')] },
  ],
};

export const FORM_SPECS: Record<AssessmentType, FormSpec> = {
  MOTHER_ADMISSION: motherAdmission,
  BABY_ADMISSION: babyAdmission,
  MOTHER_DISCHARGE: motherDischarge,
  BABY_DISCHARGE: babyDischarge,
};

export const allFields = (spec: FormSpec): FieldSpec[] => spec.groups.flatMap((g) => g.fields);

/** 数据库列名：驼峰 → 下划线 */
export const columnName = (key: string): string => key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
