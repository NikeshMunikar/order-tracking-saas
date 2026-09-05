# Order Tracking SaaS

A low-cost, multi-tenant order-tracking SaaS MVP foundation for small businesses. The repository is intentionally documentation-first and is currently **pre-implementation**.

## Repository status

**Application implementation:** Not Started  
**Database implementation:** Not Started  
**Authentication:** Provider decision OPEN  
**Production deployment:** Not Deployed  
**Documentation:** Generated and audited  

Do not interpret architecture documentation as evidence that software has been implemented.

## Documentation hierarchy

1. [`MASTER_SPEC.md`](MASTER_SPEC.md) — product requirements, approved MVP scope, and constraints; immutable source material.
2. [`docs/architecture.md`](docs/architecture.md) — approved structural architecture and boundaries.
3. [`docs/architecture-decisions.md`](docs/architecture-decisions.md) — significant technical decisions and their status.
4. [`docs/database.md`](docs/database.md) — logical data model, constraints, transactions, and persistence rules.
5. [`docs/security.md`](docs/security.md) — threats, controls, trust boundaries, and security verification.
6. [`docs/ui-ux.md`](docs/ui-ux.md) — interface and interaction requirements derived from the source.
7. [`docs/testing.md`](docs/testing.md) — verification strategy and critical tests.
8. [`docs/development.md`](docs/development.md) — coding, migration, review, and AI-agent workflow.
9. [`docs/deployment.md`](docs/deployment.md) — environment and release process.
10. [`docs/roadmap.md`](docs/roadmap.md) — MVP, post-MVP, future/conditional, and not-planned scope.
11. `ai-context/` — compact derivative context for coding agents.
12. [`CURRENT_STATE.md`](CURRENT_STATE.md) — current reality; never a source of planned architecture.
13. [`DO_NOT_BUILD.md`](DO_NOT_BUILD.md) — permanent scope and architecture firewall.

## Source-of-truth rules

`MASTER_SPEC.md` answers **what must be built**. Architecture and accepted ADRs answer **how the system is approved to be structured and why significant choices were made**. The repository answers **what is actually implemented**. Tests and evidence answer **what has actually been verified**. `CURRENT_STATE.md` records that reality.

When sources disagree, do not silently normalize them. Preserve the higher-authority requirement and document the conflict or deviation. Never edit `MASTER_SPEC.md` as a way to resolve ambiguity.

## AI-agent operating rules

Start with [`ai-context/00-rules.md`](ai-context/00-rules.md). Read the smallest authoritative set needed for the change. Inspect the repository before editing. Never trust browser-supplied tenant or financial authority. Keep Prisma behind the server-side data/service boundary. Do not introduce scope, dependencies, services, or material architecture decisions without justification and, where required, an ADR.

## Architectural baseline

The approved baseline is a modular monolithic Next.js App Router application using React, TypeScript, Tailwind CSS, PostgreSQL, Prisma, Zod, Server Components, Server Actions, and Route Handlers only where required. Multi-tenancy is pooled PostgreSQL with centralized server-side authorization and tenant-scoped data access. PostgreSQL RLS is not required for MVP.

See [`docs/architecture.md`](docs/architecture.md).

## Development workflow

Implementation proceeds in milestones rather than being generated all at once. The milestone order follows the source specification: setup, business onboarding, customers, products, orders, status workflow, public tracking, dashboard, security/testing, and deployment.

Every milestone requires tests, type checking, linting, production build verification, migration checking, and manual verification of the main workflow before it is considered complete.

See [`docs/development.md`](docs/development.md) and [`docs/roadmap.md`](docs/roadmap.md).

## Architecture changes and ADRs

Use an ADR when a choice materially affects security, persistence semantics, public interfaces, deployment architecture, or future compatibility, or when the repository moves away from an approved architectural baseline. An ADR must state context, alternatives, decision status, rationale, consequences, security/operational implications, and reconsideration conditions.

OPEN decisions are not accepted decisions. Do not code around them as though they are final unless the work is explicitly designed to remain provider-agnostic.

## Deviations

When implementation differs from an approved requirement, record the deviation, the actual behavior, the reason, approval, date, fix/migration plan, and status. Never silently redefine a requirement to match an implementation mistake.

## Verification

Implementation status changes only from repository evidence. Verification status changes only after an appropriate verification procedure. Deployment alone is not verification. Before claiming a milestone as verified, record the repository revision, environment, verifier, and evidence as appropriate in `CURRENT_STATE.md`.

## Local development

Implementation setup instructions will become executable once the repository reaches the corresponding development milestone. The intended process is to document prerequisites, environment variables, database setup, Prisma migration/seed, development server, tests, lint/type-check, production build, and deployment workflows without committing real secrets.

## Scope control

Read [`DO_NOT_BUILD.md`](DO_NOT_BUILD.md) before adding integrations or infrastructure. The MVP deliberately excludes messaging APIs, AI, payment gateways, inventory, advanced analytics, complex permissions, subscription billing, and other future capabilities.

## Current open decisions

See [`CURRENT_STATE.md`](CURRENT_STATE.md) and [`docs/architecture-decisions.md`](docs/architecture-decisions.md) for DEC-001 through DEC-009. The most immediate blocker for authentication implementation is DEC-001. DEC-009 establishes the separate platform/company authorization domain without claiming platform implementation.


## Project-wide engineering standards

Authorization is split into two independent domains. The SaaS platform/company domain has exactly `SUPER_ADMIN` and `ADMIN`; the customer-business domain has exactly `OWNER` and `STAFF`, with `BusinessMember.role ∈ { OWNER, STAFF }`. Platform roles are never business roles, and platform authority never automatically overrides tenant authorization. Detailed platform capabilities remain intentionally unspecified until authoritative platform requirements are accepted.

Security, tenant isolation, financial correctness, scalability, accessibility, human-designed UI quality, and disciplined AI-assisted development are project-wide engineering requirements. See `docs/architecture.md`, `docs/security.md`, `docs/database.md`, `docs/ui-ux.md`, `docs/testing.md`, `docs/development.md`, and `DO_NOT_BUILD.md`.
