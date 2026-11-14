import { applyNurseRoster, editDistance, matchNurseName, withRosterHint } from '../src/care/care-document/nurse-name-match';

/** 拍照识别里护理师签字和“护理部员工名单”核对（纯逻辑，不连库） */
describe('P8 签字人与护理部员工核对', () => {
  const roster = ['乔燕', '鲁婷护', '徐甜甜', '陈红', '乔芳'];

  it('编辑距离', () => {
    expect(editDistance('乔荣', '乔燕')).toBe(1);
    expect(editDistance('鲁婷', '鲁婷护')).toBe(1);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });

  it('完全一致不动；只差一个字且唯一最接近 → 自动纠正；认出半个名字也能补全', () => {
    expect(matchNurseName('乔燕', roster)).toEqual({ value: null, level: null, message: null });
    expect(matchNurseName('徐甜田', roster)).toMatchObject({ value: '徐甜甜', level: 'warn' });
    expect(matchNurseName('鲁婷', roster)).toMatchObject({ value: '鲁婷护', level: 'warn' });
    expect(matchNurseName('陈 红·', roster)).toEqual({ value: '陈红', level: null, message: null }); // 只是多了空格/标点
  });

  it('同样接近好几位：不乱改，提示可能是谁；对不上任何人：保留原样并提醒', () => {
    const amb = matchNurseName('乔荣', roster); // 乔燕、乔芳都只差一个字
    expect(amb).toMatchObject({ value: null, level: 'warn' });
    expect(amb.message).toContain('乔燕');
    expect(amb.message).toContain('乔芳');
    expect(matchNurseName('王小明', roster)).toMatchObject({ value: null, level: 'warn' });
    expect(matchNurseName('王小明', [])).toEqual({ value: null, level: null, message: null }); // 没有名单就不核对
  });

  it('整份识别结果：白班/夜班签字和喂养表每一行的责护签字都核对，提醒带正确的字段路径', () => {
    const data: Record<string, unknown> = { dayNurseName: '徐甜田', nightNurseName: '乔燕', clientSignerName: '陈红', feedings: [{ time: '08:00', nurseName: '鲁婷' }, { time: '09:00', nurseName: '无名氏' }] };
    const warns = applyNurseRoster(data, roster);
    expect(data.dayNurseName).toBe('徐甜甜');
    expect((data.feedings as { nurseName: string }[])[0].nurseName).toBe('鲁婷护');
    expect((data.feedings as { nurseName: string }[])[1].nurseName).toBe('无名氏');
    expect(warns.map((w) => [w.field, w.level])).toEqual([['dayNurseName', 'warn'], ['feedings.0.nurseName', 'warn'], ['feedings.1.nurseName', 'warn']]);
  });

  it('把名单写进 AI 字段说明（含表格列），其他字段不受影响', () => {
    const fields = withRosterHint([{ key: 'dayNurseName', aiHint: 'x' }, { key: 'weightG' }, { key: 'feedings', columns: [{ key: 'nurseName' }, { key: 'time' }] }], roster) as { key: string; aiHint?: string; columns?: { key: string; aiHint?: string }[] }[];
    expect(fields[0].aiHint).toContain('乔燕');
    expect(fields[1].aiHint).toBeUndefined();
    expect(fields[2].columns![0].aiHint).toContain('鲁婷护');
    expect(fields[2].columns![1].aiHint).toBeUndefined();
  });
});
