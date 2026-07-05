import path from "node:path";
import type PgBoss from "pg-boss";
import { resolveAbsolutePath } from "../../lib/storage";
import { summarizeDocument } from "../../lib/claude";
import { extractText } from "../lib/extractText";
import { getDocumentMeta, saveSummaryAndDecisions } from "../lib/db";
import type { GenerateSummaryPayload } from "../lib/boss";

// Claude has a large context window, but this is a defensive cap against
// pathological inputs (huge PDFs) blowing the request budget.
const MAX_CHARS_FOR_SUMMARY = 100_000;

// Non-critical by design: the document is already READY/searchable once
// process-document succeeds. A summary failure here is logged, not retried
// into a document-level failure state.
export async function generateSummaryHandler(job: PgBoss.Job<GenerateSummaryPayload>): Promise<void> {
  const { documentId } = job.data;
  const doc = await getDocumentMeta(documentId);
  if (!doc) return;

  try {
    const absolutePath = resolveAbsolutePath(doc.storagePath);
    const ext = path.extname(doc.originalFilename).toLowerCase();
    const fullText = await extractText(absolutePath, ext);
    const text = fullText.slice(0, MAX_CHARS_FOR_SUMMARY);

    const result = await summarizeDocument({ title: doc.displayTitle, text });
    await saveSummaryAndDecisions(documentId, result.summary, result.keyDecisions);

    console.log(`[worker] summary generated for document ${documentId}`);
  } catch (err) {
    console.error(
      `[worker] summary generation failed for document ${documentId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
