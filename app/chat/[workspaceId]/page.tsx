import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { ChatClient, type ChatMessage } from "./ChatClient";

export default async function ChatPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/signin");

  try {
    await requireRole(session.user.id, params.workspaceId, "TEAM_MEMBER");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/");
    throw err;
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: params.workspaceId } });
  if (!workspace) redirect("/");

  const conversation = await prisma.conversation.findFirst({
    where: { userId: session.user.id, workspaceId: params.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { citations: true },
      },
    },
  });

  // MessageCitation.documentId has no Prisma @relation (deliberately, per
  // schema.prisma), so document titles are joined in manually here.
  const citedDocumentIds = Array.from(
    new Set(
      (conversation?.messages ?? [])
        .flatMap((m) => m.citations)
        .map((c) => c.documentId)
        .filter((id): id is string => !!id)
    )
  );
  const citedDocuments = citedDocumentIds.length
    ? await prisma.document.findMany({
        where: { id: { in: citedDocumentIds } },
        select: { id: true, displayTitle: true },
      })
    : [];
  const documentTitleById = new Map(citedDocuments.map((d) => [d.id, d.displayTitle]));

  const initialMessages: ChatMessage[] = (conversation?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    confidenceScore: m.confidenceScore,
    citations: m.citations.map((c) => ({
      documentTitle: (c.documentId && documentTitleById.get(c.documentId)) || "Unknown document",
      quotedExcerpt: c.quotedExcerpt,
      relevanceScore: c.relevanceScore,
    })),
  }));

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {workspace.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Answers come only from documents uploaded to this workspace.
        </p>
        <div className="mt-8">
          <ChatClient workspaceId={workspace.id} initialMessages={initialMessages} />
        </div>
      </div>
    </main>
  );
}
