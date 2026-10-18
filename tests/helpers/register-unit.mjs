// Bootstrap for the pure unit suite.
//
// Registers the same ESM resolution hooks as the integration suite
// (tests/helpers/alias-loader.mjs): the `@/*` -> `./src/*` alias and an inert
// stand-in for Next.js's `server-only` marker, so unit tests can import real
// server modules.
//
// Unlike register.mjs this deliberately does NOT touch DATABASE_URL — unit
// tests must not require PostgreSQL.
//
// Using `node:test` here does NOT resolve DEC-004 (the unit/integration
// testing-framework decision), which remains OPEN.
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href, import.meta.url);
