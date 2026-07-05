import Anthropic from "@anthropic-ai/sdk";
import type { RetrievedChunk } from "@/lib/retrieval";
import { RespondWithCitationsSchema, type RespondWithCitations } from "@/lib/schemas/chat";

export const FALLBACK_ANSWER = "I don't have that information in the knowledge base.";

const SYSTEM_PROMPT = `You are the Second Brain knowledge assistant. Answer ONLY using the knowledge base excerpts given to you in this message — never your own training knowledge. Every claim must cite an excerpt inline as [n]. If the excerpts don't answer the question, or only tangentially relate to it, your "answer" must be exactly: "${FALLBACK_ANSWER}". Always respond by calling respond_with_citations exactly once; never respond with plain text.`;

const RESPOND_WITH_CITATIONS_TOOL: Anthropic.Tool = {
  name: "respond_with_citations",
  description: "Provide the final answer, based only on the provided excerpts. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          'Prose answer citing excerpts inline as [n]. If unanswerable from excerpts, must be exactly: "' +
          FALLBACK_ANSWER +
          '"',
      },
      citations: {
        type: "array",
        description: "One entry per [n] used in answer; empty if answer is the fallback sentence.",
        items: {
          type: "object",
          properties: {
            chunkRef: {
              type: "integer",
              description: "The bracket number matching an excerpt label, e.g. 1 for [1].",
            },
            quotedExcerpt: {
              type: "string",
              description: "Short verbatim quote (<=300 chars) from that excerpt.",
            },
          },
          required: ["chunkRef", "quotedExcerpt"],
        },
      },
      confidence: {
        type: "number",
        description: "0.0-1.0: how fully/correctly `answer` is supported by the excerpts. 0.0 if unanswerable.",
      },
    },
    required: ["answer", "citations", "confidence"],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

function buildUserContent(question: string, chunks: RetrievedChunk[]): string {
  const excerpts = chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] (Document: "${chunk.documentTitle}", ${chunk.pageOrSectionRef ?? "n/a"})\n${chunk.text}`
    )
    .join("\n\n");
  return `Knowledge base excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;
}

export async function answerFromChunks(params: {
  question: string;
  chunks: RetrievedChunk[];
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<RespondWithCitations> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  const response = await getClient().messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [RESPOND_WITH_CITATIONS_TOOL],
    tool_choice: { type: "tool", name: "respond_with_citations" },
    messages: [
      ...params.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: buildUserContent(params.question, params.chunks) },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Claude did not return a respond_with_citations tool call");
  }

  return RespondWithCitationsSchema.parse(toolUse.input);
}
