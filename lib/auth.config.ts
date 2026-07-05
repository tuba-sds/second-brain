import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe config: providers + pages only, no Prisma import anywhere in this
// file's dependency graph. middleware.ts runs on the Edge runtime and imports
// this file directly — @prisma/client's Node-only engine would break it.
export const authConfig: NextAuthConfig = {
  // NextAuth v5 auto-detects AUTH_SECRET; this repo's .env.example predates
  // that convention and uses NEXTAUTH_SECRET, so it's passed explicitly.
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {},
};
