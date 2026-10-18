/**
 * Startup validation for the Auth.js secret.
 *
 * Auth.js v5 refuses to sign or verify a session without `AUTH_SECRET` and
 * fails per-request with a generic 500 ("MissingSecret"). Failing fast at
 * server start turns that into one clear, actionable message. Called from
 * src/instrumentation.ts; see docs/deployment.md §4.
 */

/** Auth.js signs with a symmetric secret; 32 bytes of entropy is the floor. */
const MIN_AUTH_SECRET_LENGTH = 32;

export function assertAuthSecret(secret: string | undefined = process.env.AUTH_SECRET): void {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    // Never echo the value itself into an error message or log.
    throw new Error(
      "AUTH_SECRET is not set. Auth.js cannot sign or verify sessions without " +
        "it. Generate one with `npx auth secret` (or " +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"`) ' +
        "and set AUTH_SECRET in the environment. See docs/deployment.md §4.",
    );
  }

  if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET is too short: at least ${MIN_AUTH_SECRET_LENGTH} characters of ` +
        "high-entropy secret are required. Generate one with `npx auth secret`. " +
        "See docs/deployment.md §4.",
    );
  }
}
