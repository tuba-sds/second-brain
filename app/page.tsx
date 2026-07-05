import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReadableWorkspaceIds, getEffectiveRole, ROLE_RANK } from "@/lib/rbac";

export default async function Home() {
  const session = await auth();
  if (!session?.user.id) {
    redirect("/signin");
  }

  const workspaceIds = await getReadableWorkspaceIds(session.user.id);

  if (workspaceIds.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex max-w-xl flex-col items-center text-center">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 text-xl">
            🧠
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Waiting for access
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            You&apos;re signed in, but no one has granted you access to a
            workspace yet. Ask a founder or admin to add you.
          </p>
        </div>
      </main>
    );
  }

  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    orderBy: { path: "asc" },
  });

  const roles = await Promise.all(
    workspaces.map((w) => getEffectiveRole(session.user.id, w.id))
  );

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 text-xl">
          🧠
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
          Second Brain
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-500">
          Institutional memory for your company.
        </p>
      </div>

      <div className="mt-12 w-full max-w-xl divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
        {workspaces.map((workspace, i) => {
          const role = roles[i];
          const canUpload = !!role && ROLE_RANK[role] >= ROLE_RANK.MANAGER;
          const canAdmin = !!role && ROLE_RANK[role] >= ROLE_RANK.ADMIN;
          return (
            <div
              key={workspace.id}
              className="flex items-center justify-between px-6 py-4"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-neutral-900">
                  {workspace.name}
                </p>
                <p className="text-xs text-neutral-500">{role}</p>
              </div>
              <div className="flex gap-4 text-sm">
                {canAdmin && (
                  <Link
                    href={`/workspaces/${workspace.id}/admin`}
                    className="text-neutral-500 hover:text-neutral-900"
                  >
                    Admin
                  </Link>
                )}
                {canUpload && (
                  <Link
                    href={`/workspaces/${workspace.id}/upload`}
                    className="text-neutral-500 hover:text-neutral-900"
                  >
                    Upload
                  </Link>
                )}
                <Link
                  href={`/workspaces/${workspace.id}/documents`}
                  className="text-neutral-500 hover:text-neutral-900"
                >
                  Documents
                </Link>
                <Link
                  href={`/chat/${workspace.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  Chat
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
