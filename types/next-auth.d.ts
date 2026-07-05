import type { DefaultSession } from "next-auth";

// Augments the session/JWT types so `session.user.id` (our internal Prisma
// User.id, not Google's `sub`) is available and typed everywhere.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
