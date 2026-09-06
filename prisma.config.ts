import "dotenv/config";

import { defineConfig, env } from "prisma/config";

// Prisma 7 compatibility: the Prisma CLI (generate/validate/migrate) no
// longer reads datasource.url from schema.prisma (P1012). This is the
// replacement location for that connection configuration. This file is
// CLI-only tooling config, not application runtime code — the running
// application still gets its connection via the driver adapter in
// src/lib/db/client.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
