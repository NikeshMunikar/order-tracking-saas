# Development Guide

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05  
Implementation State: Not Implemented

## 1. Development philosophy

Build the smallest commercially useful secure product. Work in milestones rather than generating the entire application at once. Prefer simple, explicit code over speculative infrastructure.

## 2. Start protocol for AI agents

Before changing code:

1. Read `ai-context/00-rules.md`.
2. Read the relevant authoritative docs.
3. Read `CURRENT_STATE.md`.
4. Inspect existing implementation instead of assuming the planned structure exists.
5. Identify required invariants and verification for the change.
6. Check `DO_NOT_BUILD.md` for scope/architecture constraints.
7. Determine whether the change needs an ADR.

## 3. Technology baseline

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- PostgreSQL.
- Prisma.
- Zod.
- Playwright for E2E.
- Unit/integration framework: DEC-004 OPEN.

Do not introduce additional technology without a clear need and documentation of the decision.

## 4. Repository structure

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── track/
│   │   └── [token]/
│   └── api/
├── components/
│   ├── ui/
│   └── shared/
├── features/
│   ├── orders/
│   ├── customers/
│   ├── products/
│   └── businesses/
├── server/
│   ├── auth/
│   ├── businesses/
│   ├── customers/
│   ├── products/
│   └── orders/
├── lib/
│   ├── db/
│   ├── validation/
│   ├── security/
│   └── utils/
└── types/

prisma/
tests/
public/
```

Keep server-only code clearly separated. Use `import "server-only"` where appropriate.

## 5A. Security and maintainability standards

Treat the browser as untrusted. Authorization, tenant context, resource ownership, and financial correctness belong in server-only code. Use `import "server-only"` where appropriate. Keep Prisma out of UI components and place business logic in cohesive domain services.

The customer-business role domain is closed to exactly `OWNER` and `STAFF`. The separate SaaS platform/company domain has exactly `SUPER_ADMIN` and `ADMIN`. Never place platform roles in `BusinessMember.role`, never merge the two domains into one global role enum, and do not add a generic permission framework or role hierarchy. Authentication/provider-specific code must stay behind a small boundary. Platform authorization must have its own server-side boundary.

Prefer small cohesive modules, explicit types, predictable error handling, minimal dependencies, and measured optimization. Avoid giant components/services, global mutable state, `any` as a shortcut, silent fallback behavior, and convenience dependencies with no documented need.

## 5. Server/client boundaries

Server Components are preferred for data that can be rendered securely without browser-side fetching. Server Actions are preferred for in-application mutations. Route Handlers are used only when an actual HTTP endpoint is required.

UI components must not perform arbitrary Prisma queries.

## 6. Service/data access conventions

Organize server operations around domain capabilities such as:

- `createOrder(...)`
- `getOrder(...)`
- `getOrders(...)`
- `updateOrderStatus(...)`

These operations must perform authentication/authorization before accessing tenant data. Prefer function signatures and internal context that make tenant scope explicit rather than optional.

## 7. Validation conventions

Use Zod schemas for important server inputs, including the source examples:

- `createCustomerSchema`
- `updateCustomerSchema`
- `createProductSchema`
- `createOrderSchema`
- `updateOrderStatusSchema`
- `businessSettingsSchema`

Validation occurs at the server boundary even when client-side validation exists.

## 8. Prisma conventions

- Keep Prisma access inside server-only modules.
- Use transactions for multi-write invariants.
- Rely on database constraints for uniqueness and referential integrity.
- Avoid broad unscoped queries in tenant-sensitive code.
- Keep migrations in version control.
- Never directly modify the production database to “fix” schema drift.

## 9. Migration workflow

Schema change → Prisma schema update → generate migration → inspect migration → test locally → review destructive impact → commit migration with source changes → apply through approved deployment process.

Migration failure is release-blocking until resolved.

## 10. Naming and TypeScript

Use explicit domain-oriented names. Keep public data types separate from persistence types where a public DTO is required. Avoid `any` as a shortcut when the type system can model the data safely.

Use small functions with clear responsibilities, especially around authorization, validation, financial calculations, and status transitions.

## 11. Formatting, linting, type checking

The repository should adopt a consistent formatter/linter/type-check workflow when implementation begins. The exact tool configuration must not be fabricated in the documentation-only foundation.

Every milestone requires:

- Tests.
- Type checking.
- Linting.
- Production build verification.
- Migration checks.
- Manual core-workflow verification.

## 11A. Performance and data-access discipline

Use pagination for potentially growing lists, selective field projection, efficient tenant-scoped queries, and measured query/index optimization. Avoid N+1 queries, unnecessary round trips, full-table loading, and premature performance infrastructure.

## 12. Dependencies

Before adding a dependency, ask whether it is required by an approved MVP behavior, whether the platform/framework can already solve the problem, and what security/maintenance cost it introduces. Record materially significant dependency decisions.

## 13. Commits and pull requests

Keep changes reviewable and focused. A pull request should state what requirement or approved decision it implements, what security/tenant invariants it touches, what tests were added or run, and whether documentation/current state requires updates.

Do not mix unrelated scope expansions into a core feature change.

## 14A. Required AI-agent verification behavior

Before implementation, the agent reads `MASTER_SPEC.md`, `CURRENT_STATE.md`, relevant authoritative documents, and `DO_NOT_BUILD.md`; inspects the repository; identifies affected invariants and tests; determines whether an ADR is required; implements the smallest correct solution; and verifies it.

An AI agent must not invent roles, permissions, platform capabilities, product behavior, infrastructure, dependencies, or material financial/security semantics. Agents must understand `SUPER_ADMIN | ADMIN` as platform/company roles and `OWNER | STAFF` as customer-business roles. They must never add `ADMIN` or `SUPER_ADMIN` to `BusinessMember.role`, use platform authority as a shortcut around tenant authorization, merge the domains, silently resolve open decisions, claim tests or implementation without evidence, or optimize prematurely.

## 14. AI-assisted development governance

AI-generated code must be reviewed against source authority. AI agents must not:

- silently resolve open decisions,
- invent product requirements,
- weaken authorization,
- bypass tenant scope,
- add unsupported dependencies,
- edit production databases,
- claim verification without evidence.

A material deviation requires explicit documentation and approval.

## 15. Architecture-change workflow

When a change materially affects security guarantees, persistence semantics, public interfaces, deployment architecture, or future compatibility:

1. Identify affected requirement(s).
2. Compare alternatives.
3. Record an ADR as PROPOSED/OPEN before implementation when approval is required.
4. Update dependent docs after acceptance.
5. Implement.
6. Test and verify.
7. Update `CURRENT_STATE.md`.

## 16. Documentation update triggers

Update documentation after:

- accepted architectural decisions,
- material schema changes,
- new or changed security controls,
- scope changes,
- deployment changes,
- significant UI behavior changes,
- milestone completion,
- verified deviations.

## 17. Milestone order

Follow the source specification's ten milestones. Do not skip security/testing gates to accelerate feature development.
