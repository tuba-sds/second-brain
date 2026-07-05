import type PgBoss from "pg-boss";
import { PROCESS_DOCUMENT_QUEUE } from "../../lib/queue";
import { getOrCreateBoss, GENERATE_SUMMARY_QUEUE, ENFORCE_RETENTION_QUEUE } from "./boss";
import { processDocumentHandler } from "../jobs/processDocument";
import { generateSummaryHandler } from "../jobs/generateSummary";
import { enforceRetentionHandler } from "../jobs/enforceRetention";

// Runs daily at 03:00 server time — infrequent enough that exact timing
// doesn't matter, off-peak enough not to compete with interactive use.
const RETENTION_CRON = "0 3 * * *";

export async function startQueueConsumer(): Promise<PgBoss> {
  const boss = await getOrCreateBoss();

  // Concurrency capped at 1 on the embedding-heavy queue: Ollama is pinned
  // CPU-only (docker-compose.yml), so running more than one at a time
  // wouldn't add real throughput, just memory pressure from concurrently-
  // buffered files. Summary/retention jobs are lighter (one Claude call, or
  // a single SQL statement) so they don't need the same restriction.
  await boss.work(PROCESS_DOCUMENT_QUEUE, { teamSize: 1, teamConcurrency: 1 }, processDocumentHandler);
  await boss.work(GENERATE_SUMMARY_QUEUE, { teamSize: 2, teamConcurrency: 2 }, generateSummaryHandler);
  await boss.work(ENFORCE_RETENTION_QUEUE, { teamSize: 1, teamConcurrency: 1 }, enforceRetentionHandler);
  await boss.schedule(ENFORCE_RETENTION_QUEUE, RETENTION_CRON, {});

  console.log(
    `[worker] listening on "${PROCESS_DOCUMENT_QUEUE}", "${GENERATE_SUMMARY_QUEUE}", "${ENFORCE_RETENTION_QUEUE}" (cron: ${RETENTION_CRON})`
  );

  const shutdown = async () => {
    console.log("[worker] shutting down, waiting for in-flight jobs...");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return boss;
}
