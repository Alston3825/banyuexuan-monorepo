import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';

/** 快递100“实时快递查询”接口的一条轨迹 */
export interface TraceEvent {
  time: string;
  context: string;
  location?: string;
}
export interface TraceResult {
  /** 快递100 状态码：0 在途 1 揽收 2 疑难 3 签收 4 退签 5 派件 6 退回 7 转投 8 清关 14 拒签 */
  state: number;
  events: TraceEvent[];
  company: string;
  num: string;
}

export const LOGISTICS_STATE_LABEL: Record<number, string> = {
  [-1]: '暂无物流信息',
  0: '运输中',
  1: '已揽收',
  2: '疑难件',
  3: '已签收',
  4: '已退签',
  5: '派件中',
  6: '退回中',
  7: '转投中',
  8: '清关中',
  14: '已拒签',
};
/** 到了这些状态就不用再自动查了 */
export const LOGISTICS_FINAL_STATES = [3, 4, 6, 14];

/** 常用快递公司（快递100编码）。前端下拉用同一份。 */
export const EXPRESS_COMPANIES: { code: string; name: string }[] = [
  { code: 'yuantong', name: '圆通' },
  { code: 'zhongtong', name: '中通' },
  { code: 'zhongtongkuaiyun', name: '中通快运' },
  { code: 'shentong', name: '申通' },
  { code: 'yunda', name: '韵达' },
  { code: 'jtexpress', name: '极兔' },
  { code: 'shunfeng', name: '顺丰（需填手机尾号）' },
  { code: 'youzhengguonei', name: '邮政包裹' },
  { code: 'ems', name: 'EMS' },
  { code: 'jd', name: '京东' },
  { code: 'debangwuliu', name: '德邦' },
  { code: 'huitongkuaidi', name: '百世' },
  { code: 'youshuwuliu', name: '优速' },
  { code: 'annengwuliu', name: '安能' },
  { code: 'kuayue', name: '跨越' },
  { code: 'zhaijisong', name: '宅急送' },
];

/**
 * 快递100 实时查询（私用）。密钥放在服务器环境变量：KUAIDI100_CUSTOMER（customer）、KUAIDI100_KEY（授权 key），不写进代码。
 * POST https://poll.kuaidi100.com/poll/query.do   customer / sign / param
 * sign = MD5(param + key + customer) 转大写。
 */
@Injectable()
export class Kuaidi100Client {
  private readonly logger = new Logger(Kuaidi100Client.name);
  private readonly url = process.env.KUAIDI100_URL || 'https://poll.kuaidi100.com/poll/query.do';

  isConfigured(): boolean {
    return !!process.env.KUAIDI100_CUSTOMER && !!process.env.KUAIDI100_KEY;
  }

  async query(company: string, num: string, phoneTail?: string | null): Promise<TraceResult> {
    const customer = process.env.KUAIDI100_CUSTOMER;
    const key = process.env.KUAIDI100_KEY;
    if (!customer || !key) throw new ServiceUnavailableException('还没有配置快递100的密钥（KUAIDI100_CUSTOMER / KUAIDI100_KEY），请联系管理员');
    const param = JSON.stringify({ com: company, num, phone: phoneTail ?? '', resultv2: '0', show: '0', order: 'desc' });
    const sign = createHash('md5').update(param + key + customer).digest('hex').toUpperCase();
    let body: Record<string, unknown>;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ customer, sign, param }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      body = (await res.json()) as Record<string, unknown>;
    } catch (e) {
      this.logger.warn(`快递100 请求失败：${(e as Error).message}`);
      throw new ServiceUnavailableException('快递100 暂时连不上，稍后再试');
    }
    // 刚发出的快递、或单号/快递公司不对时：{result:false, returnCode:'500', message:'查询无结果，请隔段时间再查'}——不算故障，显示“暂无物流信息”
    if (body.result === false && String(body.returnCode) === '500' && /无结果/.test(String(body.message ?? ''))) {
      return { state: -1, events: [], company, num };
    }
    // 出错时返回 {result:false, returnCode, message}；没有轨迹时 message 常是“ok”但 data 为空，或 status 非 200
    if (body.result === false || (body.status !== undefined && String(body.status) !== '200')) {
      throw new ServiceUnavailableException(`快递100：${String(body.message ?? '查询失败')}`);
    }
    const data = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
    return {
      state: Number(body.state ?? 0),
      company: String(body.com ?? company),
      num: String(body.nu ?? num),
      events: data.map((d) => ({ time: String(d.time ?? d.ftime ?? ''), context: String(d.context ?? ''), location: d.location ? String(d.location) : undefined })),
    };
  }
}
