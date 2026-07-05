import { cache } from "react";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ROLE_RANK: Record<Role, number> = {
  TEAM_MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
  FOUNDER: 4,
};

export class ForbiddenError extends Error {}

// Highest-rank-wins across the whole ancestor chain, not nearest-specific-wins:
// a RoleAssignment at workspace W applies to W and every descendant of W (ltree
// `@>` = "is ancestor of or equal to"). If a user has multiple applicable
// assignments (e.g. ADMIN at the parent org, MANAGER at a child workspace), the
// higher rank always wins — a narrower grant can never silently downgrade
// access inherited from a broader one. Known trade-off: there is no way to
// carve out *reduced* access on a subtree once broader access exists upstream;
// revoking must happen at the level it was granted.
export const getEffectiveRole = cache(
  async (userId: string, workspaceId: string): Promise<Role | null> => {
    const rows = await prisma.$queryRaw<{ role: Role }[]>(Prisma.sql`
      SELECT ra.role
      FROM "RoleAssignment" ra
      JOIN "Workspace" anc ON ra."workspaceId" = anc.id
      WHERE ra."userId" = ${userId}
        AND (ra."expiresAt" IS NULL OR ra."expiresAt" > now())
        AND anc.path @> (SELECT path FROM "Workspace" WHERE id = ${workspaceId})
    `);
    if (rows.length === 0) return null;
    return rows.reduce<Role>(
      (best, r) => (ROLE_RANK[r.role] > ROLE_RANK[best] ? r.role : best),
      rows[0].role
    );
  }
);

export async function requireRole(
  userId: string,
  workspaceId: string,
  minRole: Role
): Promise<Role> {
  const role = await getEffectiveRole(userId, workspaceId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError(`requires ${minRole}+ at workspace ${workspaceId}`);
  }
  return role;
}

// Every workspace id readable by this user: any workspace at-or-below (ltree
// `<@`) a workspace where they hold a (non-expired) RoleAssignment.
export async function getReadableWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT w.id
    FROM "Workspace" w
    JOIN "RoleAssignment" ra
      ON ra."userId" = ${userId}
      AND (ra."expiresAt" IS NULL OR ra."expiresAt" > now())
    JOIN "Workspace" ra_ws ON ra_ws.id = ra."workspaceId"
    WHERE ra_ws.path @> w.path
  `);
  return rows.map((r) => r.id);
}
