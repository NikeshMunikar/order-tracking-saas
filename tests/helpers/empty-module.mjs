// Inert stand-in for Next.js's `server-only` marker module when the server
// service layer is loaded by `node --test` (see alias-loader.mjs).
//
// `server-only` exists to throw when a module is imported outside a React
// Server Component. The test runner is not a Server Component environment, so
// the marker is resolved to this empty module. Intentionally empty.
export {};
