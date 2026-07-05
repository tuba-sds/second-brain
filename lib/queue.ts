import PgBoss from "pg-boss";

export const PROCESS_DOCUMENT_QUEUE = "process-document";

export interface ProcessDocumentPayload {
  documentId: string;
}

// Lazy singleton, cached on globalThis like the Prisma client, so Next dev
// hot-reload doesn't spin up a new PgBoss (and its own Postgres connections)
// on every edit. boss.start() creates/migrates pg-boss's own `pgboss` schema
// under an advisory lock — safe to call independently from both this
// (web/producer) instance and the worker's own (consumer) instance.
const globalForBoss = globalThis as unknown as { pgBoss?: PgBoss };

async function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.pgBoss) {
    const boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    globalForBoss.pgBoss = boss;
  }
  return globalForBoss.pgBoss;
}

export async function enqueueProcessDocument(documentId: string): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    PROCESS_DOCUMENT_QUEUE,
    { documentId } satisfies ProcessDocumentPayload,
    { retryLimit: 3, retryBackoff: true, retryDelay: 30, expireInMinutes: 15 }
  );
}
