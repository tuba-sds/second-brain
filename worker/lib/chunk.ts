export interface TextChunk {
  index: number;
  text: string;
}

interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

// Paragraph-aware greedy packing, no tokenizer dependency: normalize
// whitespace, split on blank-line paragraph boundaries, pack paragraphs into
// windows of `maxChars`, seeding each new window with the trailing
// `overlapChars` of the previous one for retrieval continuity across chunk
// boundaries. Any single paragraph longer than `maxChars` is hard-sliced with
// the same overlap. Defaults keep each chunk comfortably inside
// nomic-embed-text's context window.
export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const maxChars = opts.maxChars ?? 1800;
  const overlapChars = opts.overlapChars ?? 200;

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  const takeOverlap = (text: string) => text.slice(Math.max(0, text.length - overlapChars));

  for (const paragraph of paragraphs) {
    let remaining = paragraph;

    while (remaining.length > maxChars) {
      flush();
      chunks.push(remaining.slice(0, maxChars));
      remaining = takeOverlap(remaining.slice(0, maxChars)) + remaining.slice(maxChars);
    }

    const candidate = current ? `${current}\n\n${remaining}` : remaining;
    if (candidate.length > maxChars && current) {
      const overlap = takeOverlap(current);
      flush();
      current = overlap ? `${overlap}\n\n${remaining}` : remaining;
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks.map((text, index) => ({ index, text }));
}
