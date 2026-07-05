import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLE_RANK, ForbiddenError } from "@/lib/rbac";
import { DocumentActions } from "./DocumentActions";

export default async function DocumentsPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/signin");

  let role;
  try {
    role = await requireRole(session.user.id, params.workspaceId, "TEAM_MEMBER");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/");
    throw err;
  }
  const canManage = ROLE_RANK[role] >= ROLE_RANK.MANAGER;
  const canHold = ROLE_RANK[role] >= ROLE_RANK.ADMIN;

  const workspace = await prisma.workspace.findUnique({ where: { id: params.workspaceId } });
  if (!workspace) redirect("/");

  const documents = await prisma.document.findMany({
    where: { workspaceId: params.workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { summary: true, keyDecisions: true },
  });

  const uploaderIds = Array.from(new Set(documents.map((d) => d.uploaderId)));
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, email: true } })
    : [];
  const uploaderEmailById = new Map(uploaders.map((u) => [u.id, u.email]));

  const activeHolds = documents.length
    ? await prisma.legalHold.findMany({
        where: {
          releasedAt: null,
          OR: [{ documentId: { in: documents.map((d) => d.id) } }, { workspaceId: params.workspaceId }],
        },
      })
    : [];
  const workspaceWideHold = activeHolds.some((h) => h.workspaceId === params.workspaceId && !h.documentId);
  const heldDocumentIds = new Set(activeHolds.map((h) => h.documentId).filter(Boolean));

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {workspace.name} — Documents
          </h1>
          {canManage && (
            <Link
              href={`/workspaces/${workspace.id}/upload`}
              className="text-sm font-medium text-neutral-900 hover:underline"
            >
              Upload
            </Link>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {documents.length === 0 && (
            <p className="text-sm text-neutral-500">No documents uploaded yet.</p>
          )}
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{doc.displayTitle}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {doc.status} &middot; uploaded by {uploaderEmailById.get(doc.uploaderId) ?? "unknown"}{" "}
                    &middot; {doc.createdAt.toLocaleDateString()}
                    {(workspaceWideHold || heldDocumentIds.has(doc.id)) && (
                      <span className="ml-2 text-amber-600">under legal hold</span>
                    )}
                  </p>
                  {doc.status === "FAILED" && doc.processingError && (
                    <p className="mt-1 text-xs text-red-600">{doc.processingError}</p>
                  )}
                </div>
                <DocumentActions
                  documentId={doc.id}
                  canManage={canManage}
                  canHold={canHold}
                  isUnderHold={workspaceWideHold || heldDocumentIds.has(doc.id)}
                />
              </div>
              {doc.summary && (
                <p className="mt-3 text-sm text-neutral-700">{doc.summary.summary}</p>
              )}
              {doc.keyDecisions.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-neutral-500">
                  {doc.keyDecisions.map((kd) => (
                    <li key={kd.id}>{kd.decisionText}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
