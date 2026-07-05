import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const CreateWorkspaceSchema = z.object({
  parentWorkspaceId: z.string().min(1),
  type: z.enum(["ORG", "DEPARTMENT", "CLIENT"]),
  name: z.string().min(1).max(200),
  // URL/path-safe segment appended to the parent's ltree path, e.g. "eng" under
  // "org" becomes "org.eng".
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "slug must be lowercase alphanumeric/underscore"),
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = CreateWorkspaceSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { parentWorkspaceId, type, name, slug } = parsed.data;

  try {
    await requireRole(session.user.id, parentWorkspaceId, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const parent = await prisma.workspace.findUnique({ where: { id: parentWorkspaceId } });
  if (!parent) {
    return NextResponse.json({ error: "parent workspace not found" }, { status: 404 });
  }

  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: {
        parentWorkspaceId,
        type,
        name,
        path: `${parent.path}.${slug}`,
      },
    });
    await createAuditLog(
      {
        actorId: session.user.id,
        actionType: "WORKSPACE_CREATED",
        resourceType: "Workspace",
        resourceSnapshot: { id: created.id, name: created.name, path: created.path },
        workspaceId: created.id,
      },
      tx
    );
    return created;
  });

  return NextResponse.json({ workspace }, { status: 201 });
}
