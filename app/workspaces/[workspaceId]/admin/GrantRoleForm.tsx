"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function GrantRoleForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), role: form.get("role") }),
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
        <label className="text-xs text-neutral-500">Email</label>
        <input
          name="email"
          type="email"
          required
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          placeholder="person@company.com"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Role</label>
        <select name="role" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
          <option value="TEAM_MEMBER">Team member</option>
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
          <option value="FOUNDER">Founder</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
      >
        {loading ? "Granting…" : "Grant"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
