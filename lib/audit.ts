import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CreateAuditLogInput {
  actorId: string | null;
  actionType: string;
  resourceType?: string;
  resourceSnapshot?: Prisma.InputJsonValue;
  workspaceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

// Accepts an optional transaction client so callers can write the audit row
// atomically with the primary mutation it records (role grant/revoke, workspace
// create, founder bootstrap) — the audit entry must never be lost relative to
// the action it describes.
export async function createAuditLog(
  input: CreateAuditLogInput,
  client: Prisma.TransactionClient | PrismaClient = prisma
): Promise<void> {
  await client.auditLog.create({ data: { ...input } });
}
