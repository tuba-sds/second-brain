import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";
import { ensureFounderBootstrap } from "@/lib/bootstrap";
import { createAuditLog } from "@/lib/audit";

// Node-only: spreads the edge-safe config and adds the Prisma-touching
// callbacks/events. Only imported by the route handler, server components, and
// server actions — never by middleware.ts.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user, profile }) {
      if (!profile?.sub || !user.email) return false;
      const dbUser = await prisma.user.upsert({
        where: { googleId: profile.sub as string },
        update: { email: user.email, name: user.name ?? undefined },
        create: {
          googleId: profile.sub as string,
          email: user.email,
          name: user.name ?? undefined,
        },
      });
      await ensureFounderBootstrap(dbUser.id);
      return true;
    },
    // Only hits the DB when `profile` is present, i.e. during the actual OAuth
    // exchange — not on every subsequent request that just reuses the JWT.
    async jwt({ token, profile }) {
      if (profile?.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { googleId: profile.sub as string },
        });
        if (dbUser) token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
  events: {
    async signIn({ profile }) {
      if (!profile?.sub) return;
      const dbUser = await prisma.user.findUnique({
        where: { googleId: profile.sub as string },
      });
      if (!dbUser) return;
      await createAuditLog({
        actorId: dbUser.id,
        actionType: "USER_SIGNED_IN",
        resourceType: "User",
        resourceSnapshot: { id: dbUser.id, email: dbUser.email },
        workspaceId: null,
      });
    },
  },
});
