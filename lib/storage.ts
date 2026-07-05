import { promises as fs } from "node:fs";
import path from "node:path";

// Shared by web (writes on upload) and worker (reads for parsing) — pure
// node:fs/node:path, no framework coupling, so it can be included directly in
// both TS programs (see worker/tsconfig.json).

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

function assertSafeSegment(segment: string, label: string): void {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error(`unsafe ${label}: ${segment}`);
  }
}

function storageRoot(): string {
  const root = process.env.FILE_STORAGE_PATH;
  if (!root) throw new Error("FILE_STORAGE_PATH is not set");
  return root;
}

export function resolveAbsolutePath(relativeStoragePath: string): string {
  return path.join(storageRoot(), relativeStoragePath);
}

export async function saveUploadedFile(
  workspaceId: string,
  documentId: string,
  originalFilename: string,
  data: Buffer
): Promise<{ relativeStoragePath: string }> {
  assertSafeSegment(workspaceId, "workspaceId");
  assertSafeSegment(documentId, "documentId");

  const ext = path.extname(originalFilename).toLowerCase();
  if (ext && !/^\.[a-z0-9]+$/.test(ext)) {
    throw new Error(`unsafe file extension: ${ext}`);
  }

  const relativeStoragePath = path.posix.join(
    workspaceId,
    documentId,
    `original${ext}`
  );
  const absolutePath = resolveAbsolutePath(relativeStoragePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);

  return { relativeStoragePath };
}

export async function readStoredFile(relativeStoragePath: string): Promise<Buffer> {
  return fs.readFile(resolveAbsolutePath(relativeStoragePath));
}

export async function deleteStoredDocument(
  workspaceId: string,
  documentId: string
): Promise<void> {
  assertSafeSegment(workspaceId, "workspaceId");
  assertSafeSegment(documentId, "documentId");
  const dir = resolveAbsolutePath(path.posix.join(workspaceId, documentId));
  await fs.rm(dir, { recursive: true, force: true });
}
