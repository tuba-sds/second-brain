import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function DELETE(
  req: Request,
  { params }: { params: { documentId: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const document = await prisma.document.findUnique({ where: { id: params.documentId } });
  if (!document || document.deletedAt) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await requireRole(session.user.id, document.workspaceId, "MANAGER");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const activeHold = await prisma.legalHold.findFirst({
    where: {
      releasedAt: null,
      OR: [{ documentId: document.id }, { workspaceId: document.workspaceId }],
    },
  });
  if (activeHold) {
    return NextResponse.json(
      { error: "document is under legal hold and cannot be deleted" },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date(), status: "SOFT_DELETED" },
    });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "DOCUMENT_DELETED",
        resourceType: "Document",
        resourceSnapshot: { id: document.id, displayTitle: document.displayTitle },
        workspaceId: document.workspaceId,
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
