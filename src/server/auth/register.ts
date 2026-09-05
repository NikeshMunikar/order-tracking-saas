"use server";

import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/security/password";
import { registerSchema } from "@/lib/validation/auth";

export type RegisterActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

/**
 * Register a new user with email + password.
 *
 * Server Action per docs/architecture.md's preference for Server Actions
 * over Route Handlers for in-app mutations. Validates input server-side
 * (browser input is untrusted), enforces email uniqueness, and hashes the
 * password with Argon2id before persisting — the plaintext password never
 * reaches storage or logs.
 */
export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    // Generic message: do not confirm/deny account existence explicitly
    // beyond what registration UX inherently requires (unlike login/reset,
    // which must not leak existence at all). Registration necessarily
    // reveals whether an email is taken; this is normal, expected UX for
    // this feature and not treated as an enumeration vulnerability.
    return {
      status: "error",
      message: "An account with this email already exists.",
    };
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name ?? null,
    },
  });

  return { status: "success" };
}
