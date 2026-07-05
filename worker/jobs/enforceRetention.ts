import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";

// Scheduled daily (see worker/lib/queue.ts). Soft-deletes documents whose
// retention period has elapsed, skipping anything under an active legal hold
// (workspace-wide or document-specific). One AuditLog row per document
// deleted this way, with no actor (system-initiated).
export async function enforceRetentionHandler(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: string; workspaceId: string; displayTitle: string }>(`
      WITH candidates AS (
        SELECT DISTINCT d.id
        FROM "Document" d
        JOIN "RetentionPolicy" rp
          ON (rp."workspaceId" = d."workspaceId" OR rp."folderId" = d."folderId")
        WHERE d."deletedAt" IS NULL
          AND d."createdAt" < now() - (rp."retentionDays" * interval '1 day')
          AND NOT EXISTS (
            SELECT 1 FROM "LegalHold" lh
            WHERE lh."releasedAt" IS NULL
              AND (lh."documentId" = d.id OR lh."workspaceId" = d."workspaceId")
          )
      )
      UPDATE "Document" d
      SET "deletedAt" = now(), status = 'SOFT_DELETED', "updatedAt" = now()
      FROM candidates c
      WHERE d.id = c.id
      RETURNING d.id, d."workspaceId", d."displayTitle"
    `);

    for (const row of result.rows) {
      await client.query(
        `INSERT INTO "AuditLog" (id, "actorId", "actionType", "resourceType", "resourceSnapshot", "workspaceId", "createdAt")
         VALUES ($1, NULL, 'DOCUMENT_RETENTION_DELETED', 'Document', $2::jsonb, $3, now())`,
        [randomUUID(), JSON.stringify({ id: row.id, displayTitle: row.displayTitle }), row.workspaceId]
      );
    }

    await client.query("COMMIT");
    if (result.rows.length > 0) {
      console.log(`[worker] retention enforcement soft-deleted ${result.rows.length} document(s)`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[worker] retention enforcement failed:", err);
  } finally {
    client.release();
  }
}
