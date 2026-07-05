// Shared by the worker (chunk ingestion) and the web app (query embedding) so
// the two can never drift on the Ollama task-prefix convention nomic-embed-text
// expects ("search_document: " for indexed text, "search_query: " for
// queries) — using the same module for both is what guarantees this.

const EMBEDDING_DIMENSIONS = 768;

interface OllamaEmbeddingResponse {
  embedding: number[];
}

async function embedWithPrefix(text: string, prefix: string): Promise<number[]> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_EMBEDDING_MODEL;
  if (!baseUrl) throw new Error("OLLAMA_BASE_URL is not set");
  if (!model) throw new Error("OLLAMA_EMBEDDING_MODEL is not set");

  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: `${prefix}${text}` }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as OllamaEmbeddingResponse;
  if (!Array.isArray(data.embedding) || data.embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Ollama returned an embedding of unexpected shape (expected ${EMBEDDING_DIMENSIONS} dims)`
    );
  }
  return data.embedding;
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  // Sequential, not concurrent: Ollama runs CPU-only (see docker-compose.yml),
  // so parallel requests would just contend for the same cores.
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await embedWithPrefix(text, "search_document: "));
  }
  return embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  return embedWithPrefix(text, "search_query: ");
}

export function getEmbeddingModel(): string {
  const model = process.env.OLLAMA_EMBEDDING_MODEL;
  if (!model) throw new Error("OLLAMA_EMBEDDING_MODEL is not set");
  return model;
}
