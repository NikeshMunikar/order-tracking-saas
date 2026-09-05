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

### Milestone 1 — Project setup

Next.js App Router, TypeScript, Tailwind, PostgreSQL, Prisma, authentication decision/implementation, and basic layout.

### Milestone 2 — Business onboarding

Business creation, settings, and membership.

### Milestone 3 — Customers

Customer CRUD, search, and customer details.

### Milestone 4 — Products

Product CRUD and active/inactive state.

### Milestone 5 — Orders

Create/view/edit orders, calculate totals, manual payment status, delivery information.

### Milestone 6 — Order workflow

Status changes and status history.

### Milestone 7 — Customer tracking

Secure tracking token, public page, timeline, copy/share.

### Milestone 8 — Dashboard

Order counts, recent orders, search/filter.

### Milestone 9 — Security/testing

Tenant isolation, validation, safe error handling, E2E testing, and mobile testing.

### Milestone 10 — Deployment

Production database, environment, domain/HTTPS, backups, monitoring.

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
