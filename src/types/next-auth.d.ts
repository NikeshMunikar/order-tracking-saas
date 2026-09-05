import type { DefaultSession } from "next-auth";

// Module augmentation: extend Auth.js's built-in types with the fields this
// project's Credentials provider and JWT callback actually use. Kept
// minimal and scoped to M1's authentication needs only.

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    sessionVersion?: number;
  }
}
