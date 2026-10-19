# Roadmap

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05

This roadmap separates approved MVP work from later possibilities. Future ideas do not become requirements merely because they appear here.

### Role and security quality gate

The MVP must retain exactly two business roles (`OWNER`, `STAFF`) and must pass negative tenant-isolation, authorization, public-data-boundary, financial-correctness, and security verification before release.

## 1. MVP — Build Now

The approved MVP is the smallest product that completes the core workflow reliably:

- Authentication.
- Business onboarding/profile/settings.
- Business membership with OWNER and STAFF roles.
- Customer management.
- Product management with active/inactive state.
- Order creation and management.
- Server-authoritative calculations.
- Manual payment status.
- Delivery/pickup information.
- Order status workflow.
- Order status history.
- Secure public tracking URL and mobile-first tracking page.
- Copy/share tracking link.
- Basic dashboard.
- Order search/filtering.
- Responsive UI.
- Tenant isolation and server-side authorization.
- Server-side validation.
- Critical automated testing.
- Development seed data.
- Basic production deployment.
- Basic logging and monitoring.

## 2. Milestones

Status annotations record execution reality: M1–M9 are **accepted by the owner** (see `CURRENT_STATE.md` §3 and the acceptance commits; M9 accepted 2026-10-19 per DEC-015); M10 (Deployment) is pending — the next milestone, awaiting owner approval before any M10 work begins. The roadmap is a planning artifact — milestone scope may expand only through owner-approved decisions (e.g. DEC-014 expanded M8, DEC-015 defined M9).

> Last Reviewed: 2026-10-19 (M9 acceptance recorded; descriptions unchanged since 2026-09-05).

### Milestone 1 — Project setup — ACCEPTED

Next.js App Router, TypeScript, Tailwind, PostgreSQL, Prisma, authentication decision/implementation, and basic layout.

### Milestone 2 — Business onboarding — ACCEPTED

Business creation, settings, and membership.

### Milestone 3 — Customers — ACCEPTED

Customer CRUD, search, and customer details.

### Milestone 4 — Products — ACCEPTED

Product CRUD and active/inactive state.

### Milestone 5 — Orders — ACCEPTED

Create/view/edit orders, calculate totals, manual payment status, delivery information.

### Milestone 6 — Order workflow — ACCEPTED

Status changes and status history.

### Milestone 7 — Customer tracking — ACCEPTED

Secure tracking token, public page, timeline, copy/share.

### Milestone 8 — Dashboard — ACCEPTED

Order counts, recent orders, search/filter.

### Milestone 9 — Security/testing — ACCEPTED (2026-10-19)

Tenant isolation, validation, safe error handling, E2E testing, and mobile testing. Executed per DEC-015: interim abuse-protection rate limiting (DEC-015 O-A over `/track/[token]`, sign-in and invitation acceptance, production-grade shared enforcement deferred to M10), Playwright E2E critical path (`docs/testing.md` §8), tenant-isolation/authorization matrix coverage (§5A), safe app-router error boundaries, and the responsive/browser + keyboard verification pass (§9). Accepted by the owner on 2026-10-19 (basis recorded in `CURRENT_STATE.md` §2 M9 STATUS / §3K) with the recorded limitations preserved — the interim limiter stays per-instance and reset-on-restart and is keyed on a possibly spoofed first `x-forwarded-for` hop unless a trusted proxy is deployed.

### Milestone 10 — Deployment — PENDING

Production database, environment, domain/HTTPS, backups, monitoring. **Next milestone — awaiting owner approval; do not begin unasked.** Includes the M10 dependencies recorded by M9: production-grade abuse protection for the selected hosting architecture (DEC-002) and the AUTH_SECRET startup fail-fast owner decision (F4).

After every milestone: run tests, type checking, linting, production build verification, migration checks, and manual core-workflow verification.

## 3. Post-MVP

These are explicitly later capabilities rather than MVP deliverables:

- Messaging integrations.
- AI features.
- Payment gateways.
- Inventory/stock/warehouse/purchasing.
- Advanced delivery/driver management.
- Advanced analytics.
- Customer accounts.
- Subscription billing.
- White-labeling.
- More complex permission models.

Any post-MVP feature must still pass the requirement and architecture change process before implementation.

## 4. Future / Conditional architecture

The source anticipates a future notification layer that could sit between order-status changes and provider adapters for WhatsApp, SMS, email, or Messenger. This should remain a clean extension seam, not an MVP implementation.

RLS may be reconsidered later if actual scale/security requirements justify it.

Infrastructure can evolve only when actual usage or requirements justify increased complexity.

## 5. Explicitly not planned for current product direction

The following should not be treated as near-term commitments simply because they are technically possible:

- Enterprise-scale distributed infrastructure.
- Free-tier-specific architecture.
- Complex analytics/BI.
- Custom identity infrastructure.
- Elaborate observability platforms.
- Large integration surfaces before core workflow validation.

## 6. Roadmap governance

A roadmap item becomes an implementation commitment only when approved as scope. Future ideas never override `MASTER_SPEC.md`, and current-state documentation must not claim roadmap work is implemented until repository evidence exists.
