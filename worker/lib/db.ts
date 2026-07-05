import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// Long-lived pool (replacing the placeholder's per-attempt Client). Raw pg is
// used instead of Prisma here because Prisma Client can't write to the
// DocumentChunk.embedding column (Unsupported("vector(768)")).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface ChunkToInsert {
  text: string;
  embedding: number[];
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function processDocumentTx(
  documentId: string,
  chunks: ChunkToInsert[],
  embeddingModel: string,
  embeddingModelVersion: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Defensive: guarantees a clean slate even if a prior attempt somehow left
    // partial rows despite the transaction wrapping this whole function.
    await client.query('DELETE FROM "DocumentChunk" WHERE "documentId" = $1', [documentId]);

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO "DocumentChunk"
           (id, "documentId", text, embedding, "embeddingModel", "embeddingModelVersion", "createdAt")
         VALUES ($1, $2, $3, $4::vector, $5, $6, now())`,
        [randomUUID(), documentId, chunk.text, toVectorLiteral(chunk.embedding), embeddingModel, embeddingModelVersion]
      );
    }

    await client.query(
      `UPDATE "Document" SET status = 'READY', "processingError" = NULL, "updatedAt" = now() WHERE id = $1`,
      [documentId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markFailed(documentId: string, workspaceId: string, errorMessage: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query('DELETE FROM "DocumentChunk" WHERE "documentId" = $1', [documentId]);
    await client.query(
      `UPDATE "Document" SET status = 'FAILED', "processingError" = $2, "updatedAt" = now() WHERE id = $1`,
      [documentId, errorMessage.slice(0, 2000)]
    );
    await client.query(
      `INSERT INTO "AuditLog" (id, "actorId", "actionType", "resourceType", "resourceSnapshot", "workspaceId", "createdAt")
       VALUES ($1, NULL, 'DOCUMENT_PROCESSING_FAILED', 'Document', $2::jsonb, $3, now())`,
      [randomUUID(), JSON.stringify({ documentId, error: errorMessage.slice(0, 2000) }), workspaceId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getDocumentForProcessing(
  documentId: string
): Promise<{ storagePath: string; originalFilename: string; workspaceId: string } | null> {
  const result = await pool.query(
    `SELECT "storagePath", "originalFilename", "workspaceId" FROM "Document"
     WHERE id = $1 AND "deletedAt" IS NULL`,
    [documentId]
  );
  return result.rows[0] ?? null;
}

export async function getDocumentMeta(
  documentId: string
): Promise<{ storagePath: string; originalFilename: string; displayTitle: string } | null> {
  const result = await pool.query(
    `SELECT "storagePath", "originalFilename", "displayTitle" FROM "Document"
     WHERE id = $1 AND "deletedAt" IS NULL`,
    [documentId]
  );
  return result.rows[0] ?? null;
}

interface KeyDecisionToInsert {
  decisionText: string;
  decisionDate?: string;
  confidence: number;
}

export async function saveSummaryAndDecisions(
  documentId: string,
  summary: string,
  keyDecisions: KeyDecisionToInsert[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "DocumentSummary" (id, "documentId", summary, "createdAt")
       VALUES ($1, $2, $3, now())
       ON CONFLICT ("documentId") DO UPDATE SET summary = EXCLUDED.summary`,
      [randomUUID(), documentId, summary]
    );
    // Replaces prior decisions wholesale rather than diffing — this only ever
    // runs once per document today (no re-summarize trigger exists yet).
    await client.query('DELETE FROM "KeyDecision" WHERE "documentId" = $1', [documentId]);
    for (const kd of keyDecisions) {
      await client.query(
        `INSERT INTO "KeyDecision" (id, "documentId", "decisionText", "decisionDate", confidence, "createdAt")
         VALUES ($1, $2, $3, $4, $5, now())`,
        [randomUUID(), documentId, kd.decisionText, kd.decisionDate ? new Date(kd.decisionDate) : null, kd.confidence]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
