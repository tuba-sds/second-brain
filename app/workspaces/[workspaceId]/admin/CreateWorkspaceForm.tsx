"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateWorkspaceForm({ parentWorkspaceId }: { parentWorkspaceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentWorkspaceId,
          type: form.get("type"),
          name: form.get("name"),
          slug: form.get("slug"),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ? JSON.stringify(data.error) : `failed (${res.status})`);
      }
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Name</label>
        <input
          name="name"
          required
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          placeholder="Engineering"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Slug</label>
        <input
          name="slug"
          required
          pattern="[a-z0-9_]+"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          placeholder="eng"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Type</label>
        <select name="type" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
          <option value="DEPARTMENT">Department</option>
          <option value="CLIENT">Client</option>
          <option value="ORG">Org</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
