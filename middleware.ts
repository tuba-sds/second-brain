import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Session-presence check only — decrypts the JWT cookie (cheap, edge-safe, no
// Postgres round trip). Workspace-scoped RBAC is resolved per-request inside
// route handlers/server components (lib/rbac.ts), not here: middleware has no
// context for arbitrary nested resource ownership, and querying Postgres for
// role inheritance on every single request/asset would be wasteful.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAuthed = !!req.auth;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith("/signin") ||
    req.nextUrl.pathname.startsWith("/api/auth");

  if (!isAuthed && !isAuthRoute) {
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)"],
};
