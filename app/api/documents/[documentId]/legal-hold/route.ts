import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const CreateHoldSchema = z.object({ reason: z.string().min(1).max(500) });

export async function POST(
  req: Request,
  { params }: { params: { documentId: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const document = await prisma.document.findUnique({ where: { id: params.documentId } });
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const parsed = CreateHoldSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await requireRole(session.user.id, document.workspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const hold = await prisma.$transaction(async (tx) => {
    const created = await tx.legalHold.create({
      data: {
        documentId: document.id,
        reason: parsed.data.reason,
        createdById: session.user.id,
      },
    });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "LEGAL_HOLD_PLACED",
        resourceType: "LegalHold",
        resourceSnapshot: created,
        workspaceId: document.workspaceId,
      },
      tx
    );
    return created;
  });

  return NextResponse.json({ legalHold: hold }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: { documentId: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const document = await prisma.document.findUnique({ where: { id: params.documentId } });
  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await requireRole(session.user.id, document.workspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await tx.legalHold.updateMany({
      where: { documentId: document.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "LEGAL_HOLD_RELEASED",
        resourceType: "LegalHold",
        resourceSnapshot: { documentId: document.id },
        workspaceId: document.workspaceId,
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
