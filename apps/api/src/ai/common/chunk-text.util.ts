/**
 * 按固定字符数切分文本，不做智能语义分段（V1文档量小，简单切分足够验证检索链路，
 * 见业务规则确认记录"P4 RAG知识库接入中"章节）。
 */
export function chunkText(content: string, chunkSize = 500): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    chunks.push(trimmed.slice(i, i + chunkSize));
  }
  return chunks;
}

/** 余弦相似度，用于RAG检索排序（应用层暴力计算，不引入独立向量数据库）。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
