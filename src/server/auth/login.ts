"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/server/auth/config";

export type LoginActionState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Log in with email + password via the Auth.js Credentials provider.
 *
 * On success, Auth.js redirects (throws a NEXT_REDIRECT signal internally),
 * so this function never returns a "success" state — only "idle"/"error".
 * Failure is always the same generic message regardless of whether the
 * email exists or the password was wrong (no account-existence leakage).
 */
export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });

    return { status: "idle" };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message: "Invalid email or password.",
      };
    }

    // Auth.js's redirect-on-success path throws a special Next.js redirect
    // error that is not an AuthError — rethrow so Next.js can handle it.
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
