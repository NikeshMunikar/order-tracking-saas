// Creates (if absent) the dedicated E2E database and applies all committed
// Prisma migrations to it. Re-runnable. The database name is derived from
// DATABASE_URL by replacing a trailing `_dev` suffix with `_e2e`, so the
// development, verification (`_test`) and system databases are never touched.
//
// The script refuses to run unless the derivation is safe (see
// `deriveE2EDatabaseUrl`) and refuses an explicit `E2E_DATABASE_URL` override
// that disagrees with the derivation.
//
// Usage:  node tests/helpers/setup-e2e-db.mjs
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { deriveE2EDatabaseUrl } from "./e2e-database-url.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const configuredUrl = process.env.DATABASE_URL;
const e2eUrl = deriveE2EDatabaseUrl(configuredUrl);

const overriddenE2EUrl = process.env.E2E_DATABASE_URL;
if (overriddenE2EUrl && overriddenE2EUrl !== e2eUrl) {
  throw new Error(
    "E2E_DATABASE_URL is set but disagrees with the derived E2E database URL; refusing to run.",
  );
}

const e2eName = new URL(e2eUrl).pathname.replace(/^\//, "");

const adminUrl = new URL(e2eUrl);
adminUrl.pathname = "/postgres";

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();

try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [e2eName]);

  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${e2eName}"`);
    console.log(`Created E2E database "${e2eName}".`);
  } else {
    console.log(`E2E database "${e2eName}" already exists.`);
  }
} finally {
  await admin.end();
}

console.log(`Applying Prisma migrations to "${e2eName}" ...`);

const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: e2eUrl },
});

if (migrate.status !== 0) {
  console.error(`\`prisma migrate deploy\` failed with exit code ${migrate.status}.`);
  process.exit(migrate.status ?? 1);
}

console.log(`E2E database "${e2eName}" is ready.`);
