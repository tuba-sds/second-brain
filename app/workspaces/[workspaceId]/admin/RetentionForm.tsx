"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function RetentionForm({
  workspaceId,
  currentDays,
}: {
  workspaceId: string;
  currentDays: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: Number(form.get("retentionDays")) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ? JSON.stringify(data.error) : `failed (${res.status})`);
      }
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
        <label className="text-xs text-neutral-500">Retention (days)</label>
        <input
          name="retentionDays"
          type="number"
          min={1}
          required
          defaultValue={currentDays ?? undefined}
          className="w-32 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          placeholder="365"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
