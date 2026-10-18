import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/db/client";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/security/password";
import { loginSchema } from "@/lib/validation/auth";
import { isSessionVersionCurrent } from "@/lib/security/session-version";

// DEC-001 (accepted, amended 2026-09-05): Auth.js Credentials provider +
// JWT session strategy (database-backed sessions are not supported by
// Auth.js alongside the Credentials provider — see the amendment record in
// docs/architecture-decisions.md). No adapter is configured: JWT sessions
// need no Account/Session/VerificationToken persistence.
//
// sessionVersion mechanism: each JWT embeds the user's `sessionVersion` at
// issuance. The `jwt` callback re-checks it against the current database
// value on every request; a mismatch means the token has been globally
// invalidated (e.g. password change/reset, staff removal) and the session
// is dropped. This is whole-account invalidation, not per-session/device
// revocation.
//
// IMPORTANT: JWT claims (including role/business data, if ever added) are
// never authoritative for authorization. Every authorization-sensitive
// server operation must re-verify current state against the database
// (docs/architecture-decisions.md DEC-001, DEC-008, DEC-009).

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Generic failure path: "no such user" and "wrong password" both
        // return null, which Auth.js surfaces as one generic authentication
        // failure.
        //
        // The unknown-email branch still runs a real Argon2id verification —
        // against a fixed dummy hash with the same cost parameters — so the
        // two branches take comparable time and login response timing does
        // not reveal whether the email exists.
        //
        // This does NOT hide account existence overall: registration reports
        // an already-registered email and there is no email-verification step
        // (DEC-001), so existence remains probeable through registration. See
        // the DEC-001 consequences in docs/architecture-decisions.md.
        if (!user) {
          await verifyPassword(DUMMY_PASSWORD_HASH, password);
          return null;
        }

        const isValidPassword = await verifyPassword(user.passwordHash, password);
        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, `user` is the object returned by authorize().
      if (user) {
        token.sessionVersion = (user as { sessionVersion: number }).sessionVersion;
        token.id = user.id;
      }

      if (typeof token.id !== "string") {
        return token;
      }

      // Re-check sessionVersion against current database state on every
      // request. If it no longer matches, invalidate the token by clearing
      // its identity — the `session` callback below then returns no user.
      const currentUser = (await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true },
      })) as unknown as { sessionVersion: number } | null;

      const tokenSessionVersion = token.sessionVersion as number | undefined;
      const currentSessionVersion = currentUser?.sessionVersion as number | undefined;

      if (!isSessionVersionCurrent(tokenSessionVersion, currentSessionVersion)) {
        return { ...token, id: undefined, sessionVersion: undefined };
      }

      return token;
    },
    async session({ session, token }) {
      if (typeof token.id === "string") {
        session.user.id = token.id;
      } else {
        // Token was invalidated by the sessionVersion check above.
        // Returning an empty user object signals "no valid session" to
        // callers without throwing — server code must still treat this as
        // unauthenticated (see requireSession in src/server/auth/session.ts).
        session.user = undefined as unknown as typeof session.user;
      }

      return session;
    },
  },
});
