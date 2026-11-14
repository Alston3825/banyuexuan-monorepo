import { readZip } from './xlsx-reader';

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** 一个段落（<w:p>）里的文字：把所有 <w:t> 拼起来，制表符/换行转成空格 */
function paraText(xml: string): string {
  const parts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) parts.push(m[1] !== undefined ? decode(m[1]) : ' ');
  return parts.join('').trim();
}

/**
 * 最小化的 .docx 读取器：按顺序取出正文里的段落和表格文字（表格每行的单元格用“ | ”隔开），
 * 够“把一份调查表/问卷读成文字”用。不支持老的 .doc、加密文件。
 */
export function readDocxText(buf: Buffer): string {
  const files = readZip(buf);
  const doc = files.get('word/document.xml');
  if (!doc) throw new Error('不是有效的 Word（.docx）文件');
  const xml = doc.toString('utf8');
  const lines: string[] = [];
  // 顺序扫描：表格(<w:tbl>)整体按行输出，其余按段落输出
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl>')) {
      for (const row of chunk.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((c) => (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map(paraText).filter(Boolean).join(' '));
        if (cells.some(Boolean)) lines.push(cells.join(' | '));
      }
    } else {
      const t = paraText(chunk);
      if (t) lines.push(t);
    }
  }
  return lines.join('\n');
}
