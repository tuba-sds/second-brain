/**
 * Second Brain worker.
 *
 * Verifies Postgres connectivity, then starts a pg-boss job consumer that
 * parses, chunks, and locally embeds (via Ollama) uploaded documents.
 */
import { Client } from "pg";
import { startQueueConsumer } from "./lib/queue";

const RETRIES = 10;
const RETRY_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[worker] DATABASE_URL is not set — check your .env file");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query("SELECT 1");
      console.log("[worker] connected to Postgres successfully");
      return;
    } catch (err) {
      console.error(
        `[worker] Postgres connection attempt ${attempt}/${RETRIES} failed:`,
        err instanceof Error ? err.message : err
      );
      if (attempt < RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    } finally {
      await client.end().catch(() => {});
    }
  }

  console.error("[worker] could not connect to Postgres — giving up");
  process.exit(1);
}

async function main(): Promise<void> {
  await checkDatabase();
  console.log("worker started");

  await startQueueConsumer();
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
