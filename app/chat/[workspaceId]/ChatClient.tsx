"use client";

import { useState, type FormEvent } from "react";

export interface ChatCitation {
  documentTitle: string;
  quotedExcerpt: string | null;
  relevanceScore: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidenceScore: number | null;
  citations: ChatCitation[];
}

function confidenceLabel(score: number | null): string {
  if (score === null) return "";
  if (score >= 0.7) return "High confidence";
  if (score >= 0.4) return "Medium confidence";
  return "Low confidence";
}

export function ChatClient({
  workspaceId,
  initialMessages,
}: {
  workspaceId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, role: "user", content: text, confidenceScore: null, citations: [] },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ? JSON.stringify(data.error) : `request failed (${res.status})`);
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          role: "assistant",
          content: data.message.content,
          confidenceScore: data.message.confidenceScore,
          citations: data.message.citations,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border border-neutral-200 px-4 py-3 ${
              m.role === "user" ? "bg-neutral-50" : "bg-white"
            }`}
          >
            <p className="whitespace-pre-wrap text-sm text-neutral-900">{m.content}</p>
            {m.role === "assistant" && m.confidenceScore !== null && (
              <p className="mt-2 text-xs text-neutral-500">{confidenceLabel(m.confidenceScore)}</p>
            )}
            {m.citations.length > 0 && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <p className="text-xs font-medium text-neutral-500">Sources</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {m.citations.map((c, i) => (
                    <li key={i} className="text-xs text-neutral-500">
                      [{i + 1}] {c.documentTitle}
                      {c.quotedExcerpt ? ` — "${c.quotedExcerpt}"` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Ask a question about what&apos;s been uploaded to this workspace.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Send"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
