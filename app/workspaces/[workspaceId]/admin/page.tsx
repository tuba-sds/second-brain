import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";
import { GrantRoleForm } from "./GrantRoleForm";
import { RevokeRoleButton } from "./RevokeRoleButton";
import { RetentionForm } from "./RetentionForm";

export default async function AdminPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/signin");

  try {
    await requireRole(session.user.id, params.workspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/");
    throw err;
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: params.workspaceId } });
  if (!workspace) redirect("/");

  const [children, assignments, retentionPolicy] = await Promise.all([
    prisma.workspace.findMany({
      where: { parentWorkspaceId: params.workspaceId },
      orderBy: { name: "asc" },
    }),
    prisma.roleAssignment.findMany({
      where: { workspaceId: params.workspaceId },
      include: { user: true },
      orderBy: { grantedAt: "desc" },
    }),
    prisma.retentionPolicy.findFirst({
      where: { workspaceId: params.workspaceId, folderId: null },
    }),
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {workspace.name} — Admin
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage sub-workspaces, role assignments, and retention.
          </p>
        </div>

        <section>
          <h2 className="text-sm font-medium text-neutral-900">Sub-workspaces</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {children.map((c) => (
              <li key={c.id} className="text-sm text-neutral-700">
                {c.name} <span className="text-xs text-neutral-400">({c.type})</span>
              </li>
            ))}
            {children.length === 0 && (
              <li className="text-sm text-neutral-500">None yet.</li>
            )}
          </ul>
          <div className="mt-4">
            <CreateWorkspaceForm parentWorkspaceId={workspace.id} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-neutral-900">Role assignments</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Roles granted here apply to this workspace and everything beneath it.
            A person must have signed in at least once before they can be granted
            a role.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm text-neutral-700">
                <span>
                  {a.user.email} — {a.role}
                </span>
                <RevokeRoleButton workspaceId={workspace.id} email={a.user.email} />
              </li>
            ))}
            {assignments.length === 0 && (
              <li className="text-sm text-neutral-500">No direct assignments at this workspace.</li>
            )}
          </ul>
          <div className="mt-4">
            <GrantRoleForm workspaceId={workspace.id} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-neutral-900">Retention</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Documents older than this are automatically soft-deleted, unless
            under an active legal hold.
          </p>
          <div className="mt-4">
            <RetentionForm
              workspaceId={workspace.id}
              currentDays={retentionPolicy?.retentionDays ?? null}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
