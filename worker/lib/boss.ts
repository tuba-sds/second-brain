import PgBoss from "pg-boss";

// Separated from queue.ts (which wires up job handlers) so job files can
// import `enqueueGenerateSummary` without creating a circular import between
// this module and the job handler modules.
export const GENERATE_SUMMARY_QUEUE = "generate-summary";
export const ENFORCE_RETENTION_QUEUE = "enforce-retention";

let boss: PgBoss | null = null;

export async function getOrCreateBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!);
    boss.on("error", (err) => console.error("[worker] pg-boss error:", err));
    await boss.start();
  }
  return boss;
}

export interface GenerateSummaryPayload {
  documentId: string;
}

export async function enqueueGenerateSummary(documentId: string): Promise<string | null> {
  const b = await getOrCreateBoss();
  return b.send(
    GENERATE_SUMMARY_QUEUE,
    { documentId } satisfies GenerateSummaryPayload,
    { retryLimit: 2, retryBackoff: true, expireInMinutes: 15 }
  );
}
