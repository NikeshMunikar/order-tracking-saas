"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";

import { safeCallbackUrl } from "@/lib/security/redirect";
import { readClientIdentityFromHeaders } from "@/lib/security/client-identity";
import {
  buildRateLimitKey,
  createRateLimiter,
  RATE_LIMIT_BOUNDARY_SIGN_IN,
  RATE_LIMITED_ACTION_MESSAGE,
  SIGN_IN_FAILURE_RATE_LIMIT,
} from "@/lib/security/rate-limit";
import { signIn, signOut } from "@/server/auth/config";

// Interim in-process fixed-window failure limiter for sign-in (DEC-015):
// process-local, per instance, reset on restart; NOT shared across
// instances and not production-grade (the M10 host design must provide
// shared abuse protection). Only FAILED attempts consume budget — a
// success never does, so one account's failures cannot lock an
// unrelated user out of signing in.
const signInFailureLimiter = createRateLimiter(SIGN_IN_FAILURE_RATE_LIMIT);

export type LoginActionState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Log in with email + password via the Auth.js Credentials provider.
 *
 * On success, Auth.js redirects (throws a NEXT_REDIRECT signal internally),
 * so this function never returns a "success" state — only "idle"/"error".
 * Failure is always the same generic message whether the email exists or the
 * password was wrong, and the provider equalizes the cost of both branches,
 * so sign-in does not reveal whether an account exists.
 *
 * Account existence is NOT hidden overall: registration reports an
 * already-registered email and there is no email-verification step
 * (DEC-001). Do not claim otherwise.
 *
 * The post-login destination comes from the untrusted `callbackUrl` field
 * (used by the "sign in, then return" invitation flow) and is passed through
 * safeCallbackUrl, which permits same-origin paths only.
 */
export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const clientIdentity = readClientIdentityFromHeaders(await headers());
  const rateLimitKey = buildRateLimitKey(RATE_LIMIT_BOUNDARY_SIGN_IN, clientIdentity);

  if (signInFailureLimiter.isBlocked(rateLimitKey)) {
    return {
      status: "error",
      message: RATE_LIMITED_ACTION_MESSAGE,
    };
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });

    return { status: "idle" };
  } catch (error) {
    if (error instanceof AuthError) {
      // Count the failed attempt against this client only. The account
      // outcome stays unchanged and the messaging still does not reveal
      // whether an account exists.
      signInFailureLimiter.consume(rateLimitKey);
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
