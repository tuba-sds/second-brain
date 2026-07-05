import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const GrantRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["FOUNDER", "ADMIN", "MANAGER", "TEAM_MEMBER"]),
  expiresAt: z.string().datetime().optional(),
});

const RevokeRoleSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = GrantRoleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, role, expiresAt } = parsed.data;

  try {
    await requireRole(session.user.id, params.workspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.roleAssignment.upsert({
      where: { userId_workspaceId: { userId, workspaceId: params.workspaceId } },
      update: {
        role,
        grantedById: session.user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      create: {
        userId,
        workspaceId: params.workspaceId,
        role,
        grantedById: session.user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "ROLE_GRANTED",
        resourceType: "RoleAssignment",
        resourceSnapshot: created,
        workspaceId: params.workspaceId,
      },
      tx
    );
    return created;
  });

  return NextResponse.json({ roleAssignment: assignment }, { status: 200 });
}

export async function DELETE(
  req: Request,
  { params }: { params: { workspaceId: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = RevokeRoleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { userId } = parsed.data;

  try {
    await requireRole(session.user.id, params.workspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const existing = await prisma.roleAssignment.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.workspaceId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "role assignment not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.roleAssignment.delete({ where: { id: existing.id } });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "ROLE_REVOKED",
        resourceType: "RoleAssignment",
        resourceSnapshot: existing,
        workspaceId: params.workspaceId,
      },
      tx
    );
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
