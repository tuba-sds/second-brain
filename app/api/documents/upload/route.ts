import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { saveUploadedFile, deleteStoredDocument } from "@/lib/storage";
import { enqueueProcessDocument } from "@/lib/queue";

// Needs Node (fs, pg-boss, pg), not the Edge runtime.
export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".pdf", ".docx"]);

function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? "25");
  return mb * 1024 * 1024;
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > maxUploadBytes()) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const workspaceId = form.get("workspaceId");
  const displayTitle = form.get("displayTitle");

  if (!(file instanceof File) || typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ error: "missing file or workspaceId" }, { status: 400 });
  }

  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `unsupported file type: ${ext || "(none)"}` },
      { status: 400 }
    );
  }

  try {
    await requireRole(session.user.id, workspaceId, "MANAGER");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const documentId = randomUUID();
  const relativeStoragePath = path.posix.join(workspaceId, documentId, `original${ext}`);

  const { document } = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        id: documentId,
        workspaceId,
        uploaderId: session.user.id,
        sourceType: ext.slice(1),
        storagePath: relativeStoragePath,
        displayTitle: typeof displayTitle === "string" && displayTitle ? displayTitle : file.name,
        originalFilename: file.name,
        status: "PROCESSING",
      },
    });
    await tx.documentVersion.create({
      data: {
        documentId: created.id,
        versionNumber: 1,
        storagePath: relativeStoragePath,
      },
    });
    return { document: created };
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await saveUploadedFile(workspaceId, documentId, file.name, buffer);
  } catch (err) {
    // DB rows exist but the file never landed on disk — clean up rather than
    // leaving a permanently-stuck PROCESSING document with nothing to process.
    await prisma.document.delete({ where: { id: documentId } }).catch(() => {});
    await deleteStoredDocument(workspaceId, documentId).catch(() => {});
    throw err;
  }

  await enqueueProcessDocument(documentId);

  return NextResponse.json(
    { documentId: document.id, status: document.status },
    { status: 202 }
  );
}
