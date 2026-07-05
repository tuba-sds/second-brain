import PgBoss from "pg-boss";
import { PROCESS_DOCUMENT_QUEUE } from "../../lib/queue";
import { processDocumentHandler } from "../jobs/processDocument";

export async function startQueueConsumer(): Promise<PgBoss> {
  const boss = new PgBoss(process.env.DATABASE_URL!);

  boss.on("error", (err) => console.error("[worker] pg-boss error:", err));

  await boss.start();
  await boss.work(
    PROCESS_DOCUMENT_QUEUE,
    // Concurrency capped at 1: Ollama is pinned CPU-only (docker-compose.yml),
    // so running more than one embedding job at a time wouldn't add real
    // throughput, just memory pressure from concurrently-buffered files.
    { teamSize: 1, teamConcurrency: 1 },
    processDocumentHandler
  );

  console.log(`[worker] listening on queue "${PROCESS_DOCUMENT_QUEUE}"`);

  const shutdown = async () => {
    console.log("[worker] shutting down, waiting for in-flight jobs...");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return boss;
}
