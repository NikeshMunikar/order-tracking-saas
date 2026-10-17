// Creates (if absent) the dedicated test database and applies all committed
// Prisma migrations to it. Re-runnable. The target database name is derived
// from DATABASE_URL by appending `_test`, so the configured development
// database is never touched.
//
// Usage:  node tests/helpers/setup-test-db.mjs
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const TEST_DATABASE_SUFFIX = "_test";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const configuredUrl = process.env.DATABASE_URL;

if (!configuredUrl) {
  throw new Error("DATABASE_URL is not set (checked the environment, then .env).");
}

const testUrl = new URL(configuredUrl);
const configuredName = testUrl.pathname.replace(/^\//, "");
const testName = configuredName.endsWith(TEST_DATABASE_SUFFIX)
  ? configuredName
  : `${configuredName}${TEST_DATABASE_SUFFIX}`;
testUrl.pathname = `/${testName}`;

const adminUrl = new URL(testUrl.toString());
adminUrl.pathname = "/postgres";

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();

try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testName]);

  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${testName}"`);
    console.log(`Created test database "${testName}".`);
  } else {
    console.log(`Test database "${testName}" already exists.`);
  }
} finally {
  await admin.end();
}

console.log(`Applying Prisma migrations to "${testName}" ...`);

const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: testUrl.toString() },
});

if (migrate.status !== 0) {
  console.error(`\`prisma migrate deploy\` failed with exit code ${migrate.status}.`);
  process.exit(migrate.status ?? 1);
}

console.log(`Test database "${testName}" is ready.`);
