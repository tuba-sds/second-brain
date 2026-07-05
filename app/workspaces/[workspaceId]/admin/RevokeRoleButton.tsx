"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevokeRoleButton({ workspaceId, email }: { workspaceId: string; email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    if (!confirm(`Revoke ${email}'s role at this workspace?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={handleRevoke}
        disabled={loading}
        className="text-xs text-red-600 hover:underline disabled:opacity-50"
      >
        {loading ? "Revoking…" : "Revoke"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
