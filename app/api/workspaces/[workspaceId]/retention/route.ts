import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const SetRetentionSchema = z.object({ retentionDays: z.number().int().positive() });

// Workspace-wide retention only (folderId left null) — per-folder policies
// exist in the schema for later, more granular UI isn't built yet.
export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = SetRetentionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await requireRole(session.user.id, params.workspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const existing = await prisma.retentionPolicy.findFirst({
    where: { workspaceId: params.workspaceId, folderId: null },
  });

  const policy = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.retentionPolicy.update({
          where: { id: existing.id },
          data: { retentionDays: parsed.data.retentionDays },
        })
      : await tx.retentionPolicy.create({
          data: { workspaceId: params.workspaceId, retentionDays: parsed.data.retentionDays },
        });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "RETENTION_POLICY_SET",
        resourceType: "RetentionPolicy",
        resourceSnapshot: saved,
        workspaceId: params.workspaceId,
      },
      tx
    );
    return saved;
  });

  return NextResponse.json({ retentionPolicy: policy });
}
