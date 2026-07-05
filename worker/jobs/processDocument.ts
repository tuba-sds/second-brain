import path from "node:path";
import type PgBoss from "pg-boss";
import { resolveAbsolutePath } from "../../lib/storage";
import { embedChunks, getEmbeddingModel } from "../../lib/embeddings";
import { extractText } from "../lib/extractText";
import { chunkText } from "../lib/chunk";
import { getDocumentForProcessing, processDocumentTx, markFailed } from "../lib/db";
import { enqueueGenerateSummary } from "../lib/boss";
import type { ProcessDocumentPayload } from "../../lib/queue";

const EMBEDDING_MODEL_VERSION = "1"; // bump if OLLAMA_EMBEDDING_MODEL's weights change meaningfully

export async function processDocumentHandler(job: PgBoss.Job<ProcessDocumentPayload>): Promise<void> {
  const { documentId } = job.data;
  const doc = await getDocumentForProcessing(documentId);
  if (!doc) {
    console.error(`[worker] document ${documentId} not found or soft-deleted, skipping`);
    return;
  }

  try {
    const absolutePath = resolveAbsolutePath(doc.storagePath);
    const ext = path.extname(doc.originalFilename).toLowerCase();

    const text = await extractText(absolutePath, ext);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("document produced no extractable text");
    }

    const embeddings = await embedChunks(chunks.map((c) => c.text));
    const embeddingModel = getEmbeddingModel();

    await processDocumentTx(
      documentId,
      chunks.map((c, i) => ({ text: c.text, embedding: embeddings[i] })),
      embeddingModel,
      EMBEDDING_MODEL_VERSION
    );

    console.log(`[worker] document ${documentId} processed: ${chunks.length} chunks`);

    // Best-effort, non-blocking: the document is already READY/searchable
    // regardless of whether summary generation succeeds.
    await enqueueGenerateSummary(documentId).catch((err) =>
      console.error(`[worker] failed to enqueue summary for ${documentId}:`, err)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] document ${documentId} failed:`, message);

    // pg-boss v10's Job retry fields — flagged in the project plan as needing
    // verification against the installed version's actual .d.ts; both casings
    // are checked defensively so this doesn't silently miscount as a real
    // release version pin would.
    const jobAny = job as unknown as Record<string, number | undefined>;
    const retryCount = jobAny.retryCount ?? jobAny.retrycount ?? 0;
    const retryLimit = jobAny.retryLimit ?? jobAny.retrylimit ?? 0;

    if (retryCount >= retryLimit) {
      await markFailed(documentId, doc.workspaceId, message);
    } else {
      // Let pg-boss reschedule per its retry/backoff policy. The transaction
      // in processDocumentTx never ran (it throws before touching the DB on
      // extraction/embedding failure) or was rolled back on write failure, so
      // there's nothing to undo before the next attempt.
      throw err;
    }
  }
}
