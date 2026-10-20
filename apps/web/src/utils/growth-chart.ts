import type { GrowthMetric, GrowthReport } from '../api/types/care-growth'

/**
 * 宝宝生长曲线图（SVG）：灰蓝带 = 国家标准 P3~P97，深一点的带 = P25~P75，中线 = P50；
 * 橙红折线 = 这个宝宝的实测。页面展示、下载图片、客户手机页都用这同一份 SVG，样子完全一致。
 */
const W = 760
const COLOR = { band: '#e6f0fb', band2: '#c9defa', p50: '#2f6fb5', edge: '#8fb4de', baby: '#e8590c', text: '#333', sub: '#888', grid: '#ececec' }
const META: Record<GrowthMetric, { name: string; unit: string; pad: number }> = {
  weight: { name: '体重', unit: 'kg', pad: 0.6 },
  length: { name: '身长', unit: 'cm', pad: 2 },
  head: { name: '头围', unit: 'cm', pad: 1 },
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

const WEEK_M = 7 / 30.4375

/** 把标准曲线截到“前 months 个月”：超出的点去掉，终点按相邻两点线性补上，保证曲线正好画到 months 月 */
function clipCurve(curve: { ages: number[]; rows: number[][] }, months: number): { ages: number[]; rows: number[][] } {
  const ages: number[] = []
  const rows: number[][] = []
  for (let k = 0; k < curve.ages.length; k++) {
    const a = curve.ages[k]
    if (a <= months + 1e-6) {
      ages.push(a)
      rows.push(curve.rows[k])
    } else {
      const a0 = curve.ages[k - 1]
      if (a0 !== undefined && a0 < months - 1e-6) {
        const t = (months - a0) / (a - a0)
        ages.push(months)
        rows.push(curve.rows[k - 1].map((v, i) => v + (curve.rows[k][i] - v) * t))
      }
      break
    }
  }
  return { ages, rows }
}

function panel(report: GrowthReport, m: GrowthMetric, top: number, months: number): { svg: string; height: number } | null {
  const full = report.curves[m]
  if (!full || full.ages.length < 2) return null
  const curve = clipCurve(full, months)
  if (curve.ages.length < 2) return null
  const pts = report.points[m].filter((p) => p.ageMonths !== null && p.ageMonths <= months + 0.03)
  const left = 56
  const right = 56
  const pw = W - left - right
  const ph = 230
  const maxAge = curve.ages[curve.ages.length - 1]
  const ys = [...curve.rows.map((r) => r[0]), ...curve.rows.map((r) => r[6]), ...pts.map((p) => p.value)]
  const yMin = Math.floor((Math.min(...ys) - META[m].pad) * 2) / 2
  const yMax = Math.ceil((Math.max(...ys) + META[m].pad) * 2) / 2
  const x = (a: number) => left + (a / maxAge) * pw
  const y = (v: number) => top + 34 + ph - ((v - yMin) / (yMax - yMin)) * ph
  const line = (i: number) => curve.ages.map((a, k) => `${k === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(curve.rows[k][i]).toFixed(1)}`).join(' ')
  const band = (lo: number, hi: number, fill: string) =>
    `<path d="${curve.ages.map((a, k) => `${k === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(curve.rows[k][hi]).toFixed(1)}`).join(' ')} ${[...curve.ages].reverse().map((a, k) => `L${x(a).toFixed(1)},${y(curve.rows[curve.ages.length - 1 - k][lo]).toFixed(1)}`).join(' ')} Z" fill="${fill}"/>`
  let g = `<text x="${left}" y="${top + 20}" font-size="17" font-weight="700" fill="${COLOR.text}">${META[m].name}（${META[m].unit}）</text>`
  // 横向网格 + 纵轴刻度
  const step = (yMax - yMin) / 5
  for (let i = 0; i <= 5; i++) {
    const v = yMin + step * i
    g += `<line x1="${left}" x2="${W - right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${COLOR.grid}"/><text x="${left - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" fill="${COLOR.sub}" text-anchor="end">${f1(v)}</text>`
  }
  // 横轴：月龄
  // 只看 1 个月时按周标刻度，否则按月
  const ticks: { a: number; label: string }[] = []
  if (months <= 1) {
    ticks.push({ a: 0, label: '出生' })
    for (let w = 1; w * WEEK_M <= months + 1e-6; w++) ticks.push({ a: w * WEEK_M, label: `${w}周` })
    ticks.push({ a: months, label: '1月' })
  } else {
    for (let a = 0; a <= months; a++) ticks.push({ a, label: a === 0 ? '出生' : `${a}月` })
  }
  for (const t of ticks) {
    g += `<line x1="${x(t.a).toFixed(1)}" x2="${x(t.a).toFixed(1)}" y1="${y(yMin).toFixed(1)}" y2="${y(yMax).toFixed(1)}" stroke="${COLOR.grid}"/>`
    g += `<text x="${x(t.a).toFixed(1)}" y="${top + 34 + ph + 18}" font-size="11" fill="${COLOR.sub}" text-anchor="middle">${t.label}</text>`
  }
  g += band(0, 6, COLOR.band) + band(2, 4, COLOR.band2)
  g += `<path d="${line(0)}" fill="none" stroke="${COLOR.edge}" stroke-width="1.4"/><path d="${line(6)}" fill="none" stroke="${COLOR.edge}" stroke-width="1.4"/>`
  g += `<path d="${line(3)}" fill="none" stroke="${COLOR.p50}" stroke-width="2"/>`
  const last = curve.rows.length - 1
  for (const [i, label] of [[6, 'P97'], [3, 'P50'], [0, 'P3']] as [number, string][]) {
    g += `<text x="${W - right + 6}" y="${(y(curve.rows[last][i]) + 4).toFixed(1)}" font-size="11" fill="${COLOR.p50}">${label}</text>`
  }
  // 宝宝的实测点
  if (pts.length > 0) {
    g += `<path d="${pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(Math.min(p.ageMonths!, maxAge)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}" fill="none" stroke="${COLOR.baby}" stroke-width="2.4"/>`
    pts.forEach((p, k) => {
      const cx = x(Math.min(p.ageMonths!, maxAge))
      const cy = y(p.value)
      g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${COLOR.baby}" stroke="#fff" stroke-width="1.5"/>`
      if (k === pts.length - 1 || pts.length <= 4) g += `<text x="${cx.toFixed(1)}" y="${(cy - 9).toFixed(1)}" font-size="12" font-weight="700" fill="${COLOR.baby}" text-anchor="middle">${f1(p.value)}</text>`
    })
  }
  return { svg: g, height: 34 + ph + 30 }
}

export function buildGrowthSvg(report: GrowthReport, opts: { title?: string; months?: number } = {}): string {
  const months = Math.min(report.maxMonths || 3, Math.max(1, opts.months ?? 3))
  const b = report.baby
  const sexText = b.sex === 'MALE' ? '男宝' : b.sex === 'FEMALE' ? '女宝' : ''
  let y = 0
  let body = ''
  const name = b.name ? `${b.name}` : `宝宝${b.sequenceNo}`
  body += `<text x="${W / 2}" y="34" font-size="22" font-weight="700" fill="${COLOR.text}" text-anchor="middle">${esc(opts.title ?? '宝宝生长曲线')}</text>`
  body += `<text x="${W / 2}" y="60" font-size="14" fill="${COLOR.sub}" text-anchor="middle">${esc(name)}${sexText ? ' · ' + sexText : ''}${b.birthDate ? ' · 出生 ' + b.birthDate : ''}${b.preterm ? ' · 早产儿（按矫正月龄）' : ''} · ${report.standardLabel} · 0~${months}月</text>`
  y = 80
  for (const m of ['weight', 'length', 'head'] as GrowthMetric[]) {
    const p = panel(report, m, y, months)
    if (!p) continue
    body += p.svg
    y += p.height
  }
  // 最新评价
  if (report.latest.length > 0) {
    body += `<text x="56" y="${y + 16}" font-size="15" font-weight="700" fill="${COLOR.text}">最近一次测量对比</text>`
    y += 20
    for (const l of report.latest) {
      y += 24
      body += `<text x="56" y="${y}" font-size="13" fill="${COLOR.text}">${esc(`${l.date}  ${l.text}（${report.standardLabel} P3 ${l.p3} ~ P50 ${l.p50} ~ P97 ${l.p97}）`)}</text>`
    }
    y += 10
  }
  const notes = [
    `图例：对比标准 = ${report.standardLabel}；浅蓝带 = 第3~97百分位；深蓝带 = 第25~75百分位（多数宝宝落在这里）；蓝线 = 第50百分位；橙色 = 本宝宝实测。`,
    `数据来源：${report.source}。曲线仅供参考，宝宝生长评价请以儿科医生意见为准。`,
    `出生后一周内体重会有生理性下降（通常不超过出生体重的 7%~10%），之后逐渐回升，属正常现象。${b.preterm ? '早产儿月龄已按矫正月龄计算。' : ''}`,
  ]
  for (const n of notes) {
    y += 20
    body += `<text x="56" y="${y}" font-size="11" fill="${COLOR.sub}">${esc(n)}</text>`
  }
  y += 24
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif"><rect width="${W}" height="${y}" fill="#fff"/>${body}</svg>`
}

/** 把 SVG 画成 PNG 并触发下载（2 倍清晰度，客户在微信里看更清楚） */
export async function downloadSvgAsPng(svg: string, filename: string): Promise<void> {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  const w = Number(m?.[1] ?? W)
  const h = Number(m?.[2] ?? 800)
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片生成失败'))
      img.src = blobUrl
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = filename
    a.click()
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
