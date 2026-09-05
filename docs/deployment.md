# Deployment

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05  
Implementation State: Not Deployed

## 1A. Platform/company authorization deployment boundary

Any future platform administration deployment must preserve a separate server-side authorization boundary for `SUPER_ADMIN` and `ADMIN`. Platform credentials and sessions must be protected according to the selected authentication architecture. Browser-controlled `businessId`, `userId`, role, and similar parameters must never establish platform authority or bypass tenant authorization.

No platform administration UI, API, infrastructure, or operational workflow is implied by this documentation until authoritative platform requirements are accepted.

## 1. Deployment target

Approved target shape:

```text
Browser
  ↓
Managed Next.js Hosting
  ↓
Managed PostgreSQL
```

The exact hosting provider and PostgreSQL provider remain OPEN decisions (DEC-002, DEC-003). No vendor-specific configuration is committed in this documentation foundation.

## 2. Environments

```text
Development
   ↓
Preview / Testing
   ↓
Production
```

Each environment must use independent appropriate configuration and credentials. Production secrets must never be reused for local development.

## 3. Required production capabilities

Before MVP production release, the environment must provide:

- Next.js application hosting compatible with the approved runtime.
- Managed PostgreSQL.
- Production environment variables/secrets.
- Domain and HTTPS.
- Database backups.
- Error monitoring.
- Basic uptime monitoring.
- Production logging.

## 4. Configuration and secrets

Use environment-based secrets. Never commit real credentials. An `.env.example` file will document required variable names once implementation configuration exists, without containing live values.

The selected authentication provider, hosting provider, database provider, and monitoring provider must have documented environment-specific configuration after their decisions are accepted.

## 5. Build and release flow

Conceptually:

```text
Change
 ↓
Tests / Typecheck / Lint
 ↓
Production Build
 ↓
Migration Review
 ↓
Preview Verification
 ↓
Deploy Application
 ↓
Apply Approved Production Migration
 ↓
Smoke Test
 ↓
Record Verification
```

The exact ordering of application versus migration steps may depend on whether a migration is backward-compatible. That procedure must be explicitly documented for the chosen deployment platform and migration when implementation begins.

## 6. Database migrations

Production database schema changes must use committed Prisma migrations through the approved release path. Destructive changes require explicit review. Migration failures are release-blocking.

The application version and migration state must remain compatible.

## 7. Rollback

Every release plan should identify:

- application rollback method,
- migration compatibility/rollback considerations,
- backup/restore fallback for irreversible data changes,
- user-impact and verification steps.

Do not assume all database migrations are safely reversible. For destructive changes, plan recovery before release.

## 8. Backups and recovery

MVP requires a database backup strategy through the chosen managed PostgreSQL provider. Before production launch, the team must understand at least the provider-supported backup/restore process and the operational owner for recovery.

Exact retention periods or RPO/RTO targets are not specified by the source and must not be invented as commitments.

## 9. Monitoring and logging

Keep observability intentionally simple:

- Server error logging.
- Basic application logs.
- Basic error monitoring.
- Basic uptime monitoring.
- Database backup status.

Do not build an elaborate internal observability platform for MVP.

Monitoring provider is DEC-005 OPEN.

## 10. Health checks and smoke tests

The production release must prove the deployed version starts correctly and the critical workflow is operational. Do not create fake health endpoints merely to claim health monitoring.

Smoke tests should cover at least the highest-risk available paths appropriate to the release, especially authentication, tenant authorization, order creation, status update, and public tracking once implemented.

## 11A. Security verification details

Production must use HTTPS, secure session/cookie configuration appropriate to the selected authentication provider, appropriate security headers, protected secrets, and deliberate public-endpoint abuse/rate-limit controls. No provider secret, private key, production credential, token, or production environment value may be committed.

Deployment verification must include review that stack traces, SQL/provider errors, tokens, and secrets are not exposed to users or public endpoints.

## 11. Production security gate

Before production release, verify:

- HTTPS.
- Secure session/cookie settings appropriate to the selected auth architecture.
- Environment secrets are not committed.
- Tenant isolation tests pass.
- Public tracking boundary is intentionally restricted.
- Abuse protection for public endpoints has been assessed and implemented where required.
- Database backups are enabled.
- Production logs do not contain avoidable sensitive data.

## 12A. Scale without premature infrastructure

Scale first through measured query/index/application improvements, pagination, selective projection, efficient transactions, and safe concurrency handling. Distributed infrastructure remains prohibited until actual usage or an approved requirement and ADR justify it.

## 12. Deployment state

As of 2026-09-04 this repository is **not deployed**. No provider, production database, domain, or production credential set is configured.
