import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireRole, ForbiddenError } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { UploadForm } from "./UploadForm";

export default async function UploadPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/signin");

  try {
    await requireRole(session.user.id, params.workspaceId, "MANAGER");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/");
    throw err;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.workspaceId },
  });
  if (!workspace) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Upload to {workspace.name}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Accepted types: .txt, .md, .pdf, .docx
        </p>
        <div className="mt-8">
          <UploadForm workspaceId={workspace.id} />
        </div>
      </div>
    </main>
  );
}
