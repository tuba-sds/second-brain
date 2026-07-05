"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentActions({
  documentId,
  canManage,
  canHold,
  isUnderHold,
}: {
  documentId: string;
  canManage: boolean;
  canHold: boolean;
  isUnderHold: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"delete" | "hold" | "release" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this document? This can't be undone from the UI.")) return;
    setLoading("delete");
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleHold() {
    const reason = prompt("Reason for placing a legal hold on this document:");
    if (!reason) return;
    setLoading("hold");
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/legal-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to place hold");
    } finally {
      setLoading(null);
    }
  }

  async function handleRelease() {
    setLoading("release");
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/legal-hold`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to release hold");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3">
        {canHold &&
          (isUnderHold ? (
            <button
              onClick={handleRelease}
              disabled={loading !== null}
              className="text-xs text-neutral-500 hover:underline disabled:opacity-50"
            >
              {loading === "release" ? "Releasing…" : "Release hold"}
            </button>
          ) : (
            <button
              onClick={handleHold}
              disabled={loading !== null}
              className="text-xs text-neutral-500 hover:underline disabled:opacity-50"
            >
              {loading === "hold" ? "Placing…" : "Place legal hold"}
            </button>
          ))}
        {canManage && (
          <button
            onClick={handleDelete}
            disabled={loading !== null || isUnderHold}
            title={isUnderHold ? "Under legal hold — cannot delete" : undefined}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            {loading === "delete" ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
