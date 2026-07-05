import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { embedQuery, getEmbeddingModel } from "@/lib/embeddings";
import { retrieveChunks, DEFAULT_TOP_K } from "@/lib/retrieval";
import { answerFromChunks, FALLBACK_ANSWER } from "@/lib/claude";
import { ChatRequestSchema } from "@/lib/schemas/chat";

const HISTORY_TURN_LIMIT = 10; // last N messages sent to Claude as context

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = ChatRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { workspaceId, message } = parsed.data;
  const userId = session.user.id;

  try {
    // Any assigned role is enough to chat — upload requires MANAGER+ instead.
    await requireRole(userId, workspaceId, "TEAM_MEMBER");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  let conversation = await prisma.conversation.findFirst({
    where: { userId, workspaceId },
    orderBy: { createdAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { userId, workspaceId } });
  }

  // Most recent N messages, restored to chronological order — `take` with an
  // ascending sort would otherwise return the *oldest* messages instead.
  const priorMessages = (
    await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURN_LIMIT,
    })
  ).reverse();

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  try {
    const embeddingModel = getEmbeddingModel();
    const queryEmbedding = await embedQuery(message);
    const chunks = await retrieveChunks({
      queryEmbedding,
      workspaceIds: [workspaceId],
      embeddingModel,
      topK: DEFAULT_TOP_K,
    });

    let answer: string;
    let confidence: number;
    let citationsToStore: {
      documentChunkId: string;
      documentId: string;
      documentTitle: string;
      relevanceScore: number;
      quotedExcerpt: string;
    }[] = [];

    if (chunks.length === 0) {
      // Defense in depth: never call Claude with zero grounding, so the
      // "answer only from the knowledge base" requirement holds even if a
      // prompt were ever bypassed — and it saves an API call.
      answer = FALLBACK_ANSWER;
      confidence = 0;
    } else {
      const history = priorMessages.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));
      const result = await answerFromChunks({ question: message, chunks, history });
      answer = result.answer;
      confidence = result.confidence;

      // Never trust a model-supplied database id — map its small integer
      // chunkRef back to the actual retrieved chunk server-side, dropping any
      // out-of-range reference defensively.
      citationsToStore = result.citations
        .filter((c) => c.chunkRef >= 1 && c.chunkRef <= chunks.length)
        .map((c) => {
          const chunk = chunks[c.chunkRef - 1];
          return {
            documentChunkId: chunk.chunkId,
            documentId: chunk.documentId,
            documentTitle: chunk.documentTitle,
            relevanceScore: chunk.similarity,
            quotedExcerpt: c.quotedExcerpt,
          };
        });
    }

    const assistantMessage = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: conversation!.id,
          role: "assistant",
          content: answer,
          confidenceScore: confidence,
        },
      });
      if (citationsToStore.length > 0) {
        await tx.messageCitation.createMany({
          data: citationsToStore.map((c) => ({
            messageId: created.id,
            documentChunkId: c.documentChunkId,
            documentId: c.documentId,
            relevanceScore: c.relevanceScore,
            quotedExcerpt: c.quotedExcerpt,
          })),
        });
      }
      await tx.searchQuery.create({
        data: {
          userId,
          workspaceId,
          queryText: message,
          topScore: chunks[0]?.similarity ?? null,
          resultCount: chunks.length,
        },
      });
      return created;
    });

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        content: answer,
        confidenceScore: confidence,
        citations: citationsToStore,
      },
    });
  } catch (err) {
    console.error("[chat] failed:", err);
    // Never fall back to answering from general knowledge on any error.
    return NextResponse.json({ error: "chat request failed" }, { status: 500 });
  }
}
