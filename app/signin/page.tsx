import { signIn } from "@/lib/auth";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-neutral-200 p-8 text-center">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 text-xl">
          🧠
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Sign in to Second Brain
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Use your company Google account.
        </p>
        {searchParams.error && (
          <p className="mt-4 text-sm text-red-600">
            Sign-in failed. Contact an admin if this continues.
          </p>
        )}
        <form
          className="mt-6 w-full"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: searchParams.callbackUrl ?? "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
