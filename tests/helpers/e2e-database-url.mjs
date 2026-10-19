// Shared derivation of the dedicated E2E database URL (node-run helper).
//
// The E2E database is derived from DATABASE_URL by replacing a trailing
// `_dev` suffix with `_e2e` (e.g. `order_tracking_dev` → `order_tracking_e2e`)
// so that development, verification (`_test`) and E2E databases are always
// distinct. The derivation refuses anything other than a `_dev` database and
// keeps `playwright.config.ts` (which must derive the same URL independently)
// and this helper in agreement.
//
// Keep in sync with playwright.config.ts.
export const E2E_DATABASE_SUFFIX = "_e2e";

export function deriveE2EDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (checked the environment, then .env).");
  }

  const url = new URL(databaseUrl);
  const configuredName = url.pathname.replace(/^\//, "");

  if (!configuredName.endsWith("_dev")) {
    throw new Error(
      `Refusing to derive an E2E database: DATABASE_URL must point at a \`*_dev\` ` +
        `development database (got "${configuredName}").`,
    );
  }

  const e2eName = `${configuredName.slice(0, -"_dev".length)}${E2E_DATABASE_SUFFIX}`;

  if (
    !e2eName.endsWith(E2E_DATABASE_SUFFIX) ||
    e2eName.endsWith("_test") ||
    e2eName === "postgres" ||
    e2eName === configuredName
  ) {
    throw new Error(`Refusing unsafe E2E database name "${e2eName}".`);
  }

  url.pathname = `/${e2eName}`;
  return url.toString();
}
