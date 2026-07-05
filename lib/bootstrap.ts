import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

// Called on every sign-in. Idempotent no-op once any root workspace exists.
//
// The very first user to ever sign in becomes FOUNDER of a newly created root
// ORG workspace; everyone after gets zero roles until a FOUNDER/ADMIN grants
// one. A Postgres advisory lock inside the transaction serializes concurrent
// first-logins (e.g. two people opening the app the same second on a fresh
// install) so two racing transactions can't both observe "zero root workspaces"
// before either commits.
export async function ensureFounderBootstrap(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('second-brain:founder-bootstrap'))`;

    const rootCount = await tx.workspace.count({ where: { parentWorkspaceId: null } });
    if (rootCount > 0) return;

    const root = await tx.workspace.create({
      data: { type: "ORG", name: "Organization", path: "org" },
    });
    await tx.roleAssignment.create({
      data: { userId, workspaceId: root.id, role: "FOUNDER", grantedById: userId },
    });
    await createAuditLog(
      {
        actorId: userId,
        actionType: "FOUNDER_BOOTSTRAP",
        resourceType: "Workspace",
        resourceSnapshot: { id: root.id, name: root.name },
        workspaceId: root.id,
      },
      tx
    );
  });
}
