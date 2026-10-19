// Playwright E2E configuration (Milestone 9).
//
// Safety: the dev server started for the suite runs against the dedicated
// E2E database only. The URL is derived from DATABASE_URL by replacing a
// trailing `_dev` suffix with `_e2e` and is refused unless the derivation is
// safe (development database, never `_test`, `postgres` or anything odd).
// Keep the derivation in sync with tests/helpers/e2e-database-url.mjs.
// Never reset or migrate an unverified database from here: the migrations
// are applied by `npm run test:e2e` (which runs
// `node tests/helpers/setup-e2e-db.mjs` first).
import "dotenv/config";
import { defineConfig } from "@playwright/test";
import process from "node:process";

const E2E_DATABASE_SUFFIX = "_e2e";

function deriveE2EDatabaseUrl(databaseUrl: string): string {
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

const e2eDatabaseUrl = deriveE2EDatabaseUrl(process.env.DATABASE_URL ?? "");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3113",
  },
  webServer: {
    command: "npm run dev -- --port 3113",
    url: "http://localhost:3113",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
    },
  },
});
