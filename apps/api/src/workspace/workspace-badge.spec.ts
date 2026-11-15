import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkbenchService } from './workbench.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/context/request-context.service';

describe('顶部铃铛个人提醒', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 13, 12));
  });
  afterEach(() => jest.useRealTimers());

  const reminder = (id: string, startDate: string, extra = {}) => ({
    id, startDate, title: id, note: null, timeOfDay: null,
    repeat: 'NONE', weekday: null, monthDay: null, completions: [], ...extra,
  });

  function setup(rows: ReturnType<typeof reminder>[], accountId = 'staff') {
    const findMany = jest.fn().mockResolvedValue(rows);
    const wb = new WorkbenchService(
      { personalReminder: { findMany } } as unknown as PrismaService,
      { tenantId: 'tenant', accountId } as RequestContextService,
    );
    const business = { badge: jest.fn().mockResolvedValue({ total: 3, overdue: 1 }) };
    const controller = new WorkspaceController(business as unknown as WorkspaceService, wb);
    return { controller, findMany };
  }

  it('计入当天和最近7天未完成的一次性提醒，排除未来、过旧及已完成提醒', async () => {
    const { controller, findMany } = setup([
      reminder('today', '2026-11-13'),
      reminder('overdue', '2026-11-06'),
      reminder('old', '2026-11-05'),
      reminder('future', '2026-11-14'),
      reminder('done', '2026-11-13', { completions: [{ date: '2026-11-13' }] }),
      reminder('overdue-done', '2026-11-12', { completions: [{ date: '2026-11-12' }] }),
    ]);
    expect(await controller.badge()).toEqual({ total: 5, overdue: 2 });
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant', accountId: 'staff', active: true },
      include: { completions: true },
    });
  });

  it('重复提醒只计当天，完成后减少，撤销完成后恢复', async () => {
    const rows = [reminder('daily', '2026-11-01', {
      repeat: 'DAILY', completions: [{ date: '2026-11-12' }],
    })];
    const { controller } = setup(rows);
    expect(await controller.badge()).toEqual({ total: 4, overdue: 1 });
    rows[0].completions.push({ date: '2026-11-13' });
    expect(await controller.badge()).toEqual({ total: 3, overdue: 1 });
    rows[0].completions.pop();
    expect(await controller.badge()).toEqual({ total: 4, overdue: 1 });
  });

  it('没有个人提醒仍保留业务待办数，查询始终限定当前账号', async () => {
    const { controller, findMany } = setup([], 'other-staff');
    expect(await controller.badge()).toEqual({ total: 3, overdue: 1 });
    expect(findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant', accountId: 'other-staff', active: true,
    });
  });
});
