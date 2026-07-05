"use client";

import { useState, type FormEvent } from "react";

export function UploadForm({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    if (!fileInput.files?.[0]) return;

    setStatus("uploading");
    setErrorMessage(null);

    const body = new FormData();
    body.set("file", fileInput.files[0]);
    body.set("workspaceId", workspaceId);

    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ? JSON.stringify(data.error) : `upload failed (${res.status})`);
      }
      setStatus("done");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "upload failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        type="file"
        name="file"
        accept=".txt,.md,.pdf,.docx"
        required
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={status === "uploading"}
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
      >
        {status === "uploading" ? "Uploading…" : "Upload"}
      </button>
      {status === "done" && (
        <p className="text-sm text-neutral-500">
          Uploaded — processing in the background. It&apos;ll be searchable once
          ready.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}
