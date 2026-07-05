# Second Brain

An internal, self-hosted AI knowledge base. Founders and managers upload
documents; employees chat with an AI that answers only from uploaded
knowledge, with citations and confidence scores.

**Status: Phases 0-8 implemented — a working end-to-end product.**

- **Phase 0** — infrastructure scaffold (Docker Compose stack, Next.js shell,
  Prisma schema, worker placeholder).
- **Phase 1** — hand-authored initial migration finalizing `Workspace.path` as
  a real Postgres `ltree` column and `DocumentChunk.embedding` as `vector(768)`
  with an HNSW cosine index (`prisma/migrations/20260706000000_init`).
- **Phase 2** — Google OAuth sign-in (NextAuth v5), workspace-hierarchy RBAC
  with role inheritance (`lib/rbac.ts`), first-user-becomes-FOUNDER
  bootstrapping, and an audit log.
- **Phase 3** — document upload (`.txt`/`.md`/`.pdf`/`.docx`) to local disk, a
  pg-boss job queue, and a worker pipeline that extracts text, chunks it, and
  embeds it locally via Ollama.
- **Phase 4** — retrieval-augmented chat: pgvector similarity search scoped to
  the roles a user actually holds, Claude (forced tool-call output) answering
  only from retrieved excerpts with inline citations and a confidence score,
  or a canned "I don't have that information" response when nothing relevant
  is found.
- **Phase 5** — after ingestion, a second background job asks Claude for a
  short summary and any key decisions stated in the document (non-blocking:
  the document is already searchable regardless of whether this succeeds).
- **Phase 6** — a per-workspace document library page (status, uploader,
  summary, key decisions) with MANAGER+ soft-delete.
- **Phase 7** — an ADMIN+ console for creating sub-workspaces and
  granting/revoking roles by email.
- **Phase 8** — per-workspace retention policies and per-document legal holds,
  enforced by a daily scheduled job that soft-deletes expired documents while
  skipping anything under an active hold.

Not yet built: multi-conversation history per workspace (one conversation per
user per workspace for now), per-folder (as opposed to per-workspace)
retention policies, and a UI for placing a hold on an entire workspace rather
than a single document (the enforcement logic supports it; only the
document-level "place hold" button is wired up).

## Compliance posture (read before adding dependencies)

Second Brain is **self-hosted by design**. Uploaded files live on **local
disk** (`FILE_STORAGE_PATH`) — there is no S3 and no AWS SDK anywhere, and
none should be added. Embeddings are generated **locally via Ollama** (open
models such as `nomic-embed-text`); do not introduce hosted embeddings APIs
(OpenAI, Voyage, Cohere, etc.). The only external AI dependency is the
**Anthropic API** for Claude chat completions, and the only external auth
dependency is **Google OAuth** for login. Future contributors: please do not
reintroduce cloud storage or hosted-embedding dependencies — they violate the
compliance constraints this product is sold on.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Compose v2)
- [Node.js LTS](https://nodejs.org/) (v20+) — for running Prisma CLI and local tooling
- A Google Cloud OAuth 2.0 client (client ID + secret)
- An Anthropic API key from your company's Anthropic account
  (this is separate from any Claude Code CLI subscription)

## Local setup

1. **Configure environment**

   ```powershell
   Copy-Item .env.example .env
   ```

   Then edit `.env` and fill in:
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
     (APIs & Services > Credentials > OAuth client ID; redirect URI
     `http://localhost:3000/api/auth/callback/google`)
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `ANTHROPIC_MODEL` — verify against current Anthropic docs; defaults to
     `claude-sonnet-5` if left unset
   - `NEXTAUTH_SECRET` — any long random string (`openssl rand -base64 32`)

2. **Install dependencies (host)**

   ```powershell
   npm install
   ```

3. **Start the stack**

   ```powershell
   docker compose up --build
   ```

   This starts:
   - `postgres` (pgvector/pg16) on `localhost:5432` — the `vector`, `ltree`,
     and `pg_trgm` extensions are created automatically on first boot
   - `ollama` on `localhost:11434` (CPU-only by default; GPU passthrough is
     unreliable on Windows Docker Desktop)
   - `web` (Next.js dev server) on http://localhost:3000
   - `worker` (pg-boss job runner — parses, chunks, and embeds uploads)

4. **Create the database schema**

   With the stack running, from the host:

   ```powershell
   npx prisma migrate deploy
   npx prisma generate
   ```

   `migrate deploy` applies the hand-authored
   `prisma/migrations/20260706000000_init` migration as-is (no shadow database
   needed) — it's hand-written rather than generated because it finalizes two
   Postgres-native types Prisma can't generate DDL for on its own:
   `Workspace.path` as a real `ltree` column and `DocumentChunk.embedding` as
   `vector(768)` with an HNSW cosine index.

   Note: `DATABASE_URL` in `.env` points at `localhost:5432` for host
   tooling like Prisma; the `web` and `worker` containers automatically use
   the in-network `postgres` hostname instead (see `docker-compose.yml`).

5. **Pull the local embedding model**

   ```powershell
   docker compose exec ollama ollama pull nomic-embed-text
   ```

   The model name is configured via `OLLAMA_EMBEDDING_MODEL` in `.env`.

6. **Verify**

   Open http://localhost:3000 — you should be redirected to `/signin`. Sign
   in with Google; the first user ever to sign in becomes `FOUNDER` of a root
   "Organization" workspace and lands on a workspace list. From there:
   upload a `.txt`/`.md`/`.pdf`/`.docx` file, watch `docker compose logs
   worker` for chunking/embedding progress, then open the workspace's chat
   and ask a question about what you uploaded — you should get an answer
   with an inline citation and a confidence label. A question unrelated to
   the uploaded content should get "I don't have that information in the
   knowledge base." instead of a hallucinated answer. The workspace's
   **Documents** page should show the upload with a status, and a short
   AI-generated summary once the background summary job finishes. The
   **Admin** page (visible to ADMIN+/FOUNDER) lets you create sub-workspaces
   and grant/revoke roles by email, and set a retention policy in days.

## Project layout

```
app/                        Next.js App Router
  signin/                   Google sign-in page
  workspaces/[id]/upload/   Upload UI (MANAGER+)
  workspaces/[id]/documents/ Document library (status, summary, soft-delete)
  workspaces/[id]/admin/    Sub-workspace + role + retention admin (ADMIN+)
  chat/[id]/                RAG chat UI
  api/auth/                 NextAuth route handler
  api/workspaces/           Workspace create + role grant/revoke + retention
  api/documents/upload/     Upload endpoint -> enqueues a processing job
  api/documents/[id]/       Soft-delete + legal-hold endpoints
  api/chat/                 Retrieval + Claude chat endpoint
lib/                        Shared server code (Prisma client, auth config,
                             RBAC, audit log, storage, embeddings, retrieval,
                             Claude client) — lib/storage.ts and
                             lib/embeddings.ts are also compiled into the
                             worker's own TS program (see worker/tsconfig.json)
                             so both sides share one implementation
db/init/                     Postgres init SQL (extensions), runs on first boot
prisma/schema.prisma          Full data model (workspaces, RBAC, documents,
                              chunks, retention/legal hold, audit log)
prisma/migrations/            Hand-authored init migration (ltree/vector/HNSW)
worker/                       pg-boss consumer: extract text -> chunk ->
                              embed (Ollama) -> write DocumentChunk rows, then
                              a second job generates a summary/key decisions;
                              a daily scheduled job enforces retention policies
Dockerfile                    Next.js dev container
Dockerfile.worker             Worker container
docker-compose.yml             postgres + ollama + web + worker
```

## Notes

- Postgres dev credentials (`secondbrain`/`secondbrain`) are hardcoded in
  `docker-compose.yml` for local development only.
- RBAC precedence: a role granted at a workspace applies to that workspace and
  everything beneath it in the hierarchy; if a user has roles at more than one
  applicable level, the highest-ranked one wins (a narrower grant can never
  silently downgrade access inherited from a broader one). See `lib/rbac.ts`.
- Uploading requires `MANAGER` or higher in the target workspace; chatting
  requires any assigned role; creating sub-workspaces, granting/revoking
  roles, setting retention, and placing/releasing legal holds all require
  `ADMIN` or higher.
- A legal hold (workspace-wide or on a specific document) blocks both manual
  deletion and automatic retention deletion of the document(s) it covers.
- pg-boss's exact `Job` retry-field casing (`retryCount` vs `retrycount`) and
  its `schedule()` cron API are read/used defensively/as-documented in the
  worker since this was written without being able to run `npm install` and
  check the installed version's types directly — verify against
  `node_modules/pg-boss` after installing.
