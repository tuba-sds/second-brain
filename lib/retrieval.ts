import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageOrSectionRef: string | null;
  text: string;
  similarity: number;
}

export const DEFAULT_TOP_K = 8;
// Needs empirical tuning once a real corpus/eval set exists — nomic-embed-text
// cosine-similarity distributions aren't well-calibrated to a fixed threshold.
const SIMILARITY_FLOOR = 0.15;

export async function retrieveChunks(opts: {
  queryEmbedding: number[];
  workspaceIds: string[];
  embeddingModel: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const vectorLiteral = `[${opts.queryEmbedding.join(",")}]`;

  // Ordered by pgvector's cosine-distance operator (`<=>`) — this uses the HNSW
  // vector_cosine_ops index from the Phase 1 migration. Filtered to READY,
  // non-deleted documents in the caller's readable workspaces, and to chunks
  // embedded with the currently-configured model (guards against ever
  // comparing vectors from two different embedding models, whose vector spaces
  // aren't comparable).
  const rows = await prisma.$queryRaw<
    { chunkId: string; documentId: string; documentTitle: string; pageOrSectionRef: string | null; text: string; similarity: number }[]
  >(Prisma.sql`
    SELECT
      c.id                 AS "chunkId",
      c."documentId"       AS "documentId",
      d."displayTitle"     AS "documentTitle",
      c."pageOrSectionRef" AS "pageOrSectionRef",
      c.text               AS "text",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS "similarity"
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c."embeddingModel" = ${opts.embeddingModel}
      AND c."documentId" IN (
        SELECT id FROM "Document"
        WHERE "workspaceId" = ANY(${opts.workspaceIds})
          AND status = 'READY'
          AND "deletedAt" IS NULL
      )
    ORDER BY c.embedding <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `);

  return rows.filter((r) => r.similarity >= SIMILARITY_FLOOR);
}
