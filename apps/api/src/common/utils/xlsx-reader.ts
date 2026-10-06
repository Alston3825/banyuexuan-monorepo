import { inflateRawSync } from 'zlib';

/**
 * 最小化的 .xlsx 读取器：只读单元格里的文字/数字（够“导入采购清单、员工表”这类简单表格用），
 * 不依赖第三方库。支持 Excel / WPS 保存的标准 xlsx；不支持老的 .xls、加密文件。
 */
export type CellValue = string | number | null;
export interface XlsxSheet {
  name: string;
  /** 按行列展开的二维数组，空单元格为 null；行号 = 下标 + 1 */
  rows: CellValue[][];
}

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZip(buf: Buffer): Map<string, Buffer> {
  // 从尾部找“目录结束标记”(PK\x05\x06)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 xlsx 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('xlsx 文件目录损坏');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const out = new Map<string, Buffer>();
  for (const [name, e] of entries) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const o = e.localOffset;
    if (buf.readUInt32LE(o) !== 0x04034b50) continue;
    const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
    const data = buf.subarray(start, start + e.compressedSize);
    out.set(name, e.method === 0 ? Buffer.from(data) : inflateRawSync(data));
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 取一段 XML 里所有 <t>…</t> 的文字拼起来（忽略拼音注音 rPh） */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const parts: string[] = [];
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) parts.push(decodeXml(m[1] ?? ''));
  return parts.join('');
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(buf: Buffer): XlsxSheet[] {
  const files = readZip(buf);
  const get = (name: string) => files.get(name)?.toString('utf8');
  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('不是有效的 xlsx 文件（缺少工作簿）');

  const shared: string[] = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rels = new Map<string, string>();
  for (const m of (get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const sheets: XlsxSheet[] = [];
  let seq = 0;
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    seq += 1;
    const name = decodeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? `Sheet${seq}`);
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    const path = (rid && rels.get(rid)) || `xl/worksheets/sheet${seq}.xml`;
    const xml = get(path);
    if (!xml) continue;
    const rows: CellValue[][] = [];
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowNo = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
      const cells: CellValue[] = [];
      for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const body = cm[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value: CellValue = null;
        if (type === 'inlineStr') value = textOf(body);
        else if (v !== undefined) {
          if (type === 's') value = shared[Number(v)] ?? null;
          else if (type === 'str' || type === 'e') value = decodeXml(v);
          else if (type === 'b') value = v === '1' ? 1 : 0;
          else value = Number(v);
        }
        const idx = ref ? colIndex(ref) : cells.length;
        while (cells.length < idx) cells.push(null);
        cells[idx] = value;
      }
      while (rows.length < rowNo - 1) rows.push([]);
      rows[rowNo - 1] = cells;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
