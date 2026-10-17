// ESM resolution hooks so the DB-backed integration tests can import the real
// server modules under `node --test`.
//
// Node's default resolver cannot handle two things the application relies on:
//
//   1. The `@/*` -> `./src/*` path alias from tsconfig.json (used by every
//      server module, e.g. `@/lib/db/client`). Node only resolves relative
//      specifiers and package names, so these fail with ERR_MODULE_NOT_FOUND.
//   2. `server-only` — a Next.js marker module that intentionally throws when
//      imported outside a React Server Component.
//
// This hook changes only how the *test process* resolves imports. It does not
// modify application code and is never used by the running application.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(helpersDir, "..", "..");
const srcDir = path.join(projectRoot, "src");
const inertServerOnlyUrl = pathToFileURL(path.join(helpersDir, "empty-module.mjs")).href;

// TypeScript sources are imported with their real extension in this repo, but
// try the common variants so the hook stays robust if that convention changes.
const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: inertServerOnlyUrl, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const target = path.join(srcDir, specifier.slice(2));

    for (const suffix of RESOLUTION_SUFFIXES) {
      const candidate = `${target}${suffix}`;
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}
