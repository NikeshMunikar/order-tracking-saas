# DO NOT BUILD — Order Tracking SaaS MVP Firewall

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + approved decisions  
Last Reviewed: 2026-09-05  

This file is a scope and architecture firewall. It prevents AI agents and contributors from expanding the MVP or introducing infrastructure that the source material does not justify.

## 1A. Business-role firewall

The business-facing role model is closed to exactly two values: `OWNER` and `STAFF`.

Do not introduce `ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`, `SUPER_ADMIN`, `ACCOUNTANT`, or any other value as a customer-business role. No other business roles are permitted. Do not create a generic permission engine. Do not encode platform/internal administration into `BusinessMember.role`; any future platform-admin concept must be separately designed and governed.

## 1B. Platform-role firewall

The SaaS platform/company authorization domain is separate from customer-business membership and has exactly two platform roles: `SUPER_ADMIN` and `ADMIN`. These roles are not values of `BusinessMember.role`. Do not create a single global role enum that conflates platform and tenant authorization.

Do not invent a detailed platform permission matrix, platform dashboard, platform APIs, or platform administration features without authoritative platform requirements. Platform role assignment must not be exposed through ordinary tenant-member operations.

Platform roles must never be used to bypass tenant isolation; any future platform operation touching tenant data requires explicit server-side authorization, tenant-scope validation, least-privilege treatment, and appropriate audit/security controls.

## 1. Product features explicitly outside MVP

Do not implement the following in the MVP:

- WhatsApp Cloud API, webhooks, authentication, message templates, automated notifications, or chatbot behavior.
- Messenger API integration.
- Instagram API integration.
- SMS provider integration.
- Automated email messaging.
- AI chatbot, AI ordering, AI order parsing, AI recommendations, AI customer support, or AI product search.
- eSewa, Khalti, Stripe, PayPal, bank API, or other payment-gateway integration.
- Automatic payment reconciliation.
- Inventory, stock levels, warehouses, purchasing, or supplier management.
- Advanced delivery management or driver management.
- Advanced business intelligence, complex reports, revenue forecasting, customer segmentation, or advanced analytics dashboards.
- Customer accounts for tracking.
- Subscription billing.
- White-labeling.
- Complex permission systems.
- Marketing automation.

## 2. Infrastructure and architecture that are not justified for MVP

Do not introduce any of the following unless an approved requirement or later architecture change explicitly justifies it:

- Microservices or a separate backend service.
- Kubernetes or container orchestration.
- Kafka, Redis, message queues, or distributed event infrastructure.
- GraphQL.
- Elasticsearch or a search cluster.
- PostgreSQL Row-Level Security for MVP as an unreviewed default.
- A second primary database.
- Provider-specific architecture that makes the product dependent on a free-tier behavior.
- An elaborate observability platform.

The approved target remains a simple browser → managed Next.js application → managed PostgreSQL deployment model.

### Security-hardening firewall

Do not weaken security for convenience. Every applicable authorization/tenant check must be server-side. Do not expose raw ORM records publicly, omit appropriate production security headers, skip public endpoint abuse review, or return stack traces, SQL/provider errors, tokens, credentials, or secrets to users.

## 3. Security shortcuts that are prohibited

Never:

- Trust `businessId`, `userId`, `role`, `customerId`, `orderId`, prices, totals, payment status, or similar security-sensitive values merely because the browser supplied them.
- Put authorization only in client-side UI logic.
- Fetch tenant resources by unscoped identifiers in business operations.
- Return raw database records from the public tracking endpoint.
- Expose internal database IDs through public tracking URLs where avoidable.
- Implement custom password hashing or an unapproved custom authentication system.
- Commit real secrets or production credentials.
- Display raw database/server errors to end users.
- Treat a successful deployment as proof of correctness.
- Skip tenant-isolation tests because the query “looks scoped.”

## 4. AI-agent shortcuts that are prohibited

An AI coding agent must not:

- Add a dependency because it is convenient without documenting why it is needed.
- Add a new service or provider without an approved decision.
- Convert roadmap/future functionality into MVP requirements.
- Mark a feature IMPLEMENTED because a document says it should exist.
- Modify `MASTER_SPEC.md` to remove ambiguity or contradiction.
- Modify production databases directly.
- Bypass server-side authorization for speed.
- Spread Prisma queries throughout UI components.
- Create fake integrations, fake health checks, or placeholder “working” implementations.
- Resolve an OPEN decision silently when the choice materially affects behavior, security, persistence, public interfaces, or deployment architecture.

## 5. Authentication firewall

Use exactly one authentication solution. Candidates named by the source material are Supabase Auth, Clerk, and Auth.js. Do not implement two providers, custom password infrastructure, or a second identity system. The provider and internal identity model must be documented in an accepted ADR before authentication implementation begins.

## 6. Database firewall

Do not:

- Create a Prisma schema that materially adds unsupported business behavior.
- Remove required historical snapshots.
- Physically delete customers/products when doing so would break historical order relationships.
- Store authoritative currency using unsafe floating-point semantics.
- Generate order numbers from database IDs.
- Make public tracking tokens predictable or sequential.
- Skip version-controlled migrations.
- Apply production schema changes manually as a substitute for migrations.

## 7. API and application-boundary firewall

Do not introduce a separate REST backend merely because Route Handlers exist in the approved baseline. Prefer Server Actions for in-application mutations and Route Handlers only where an actual HTTP endpoint is required. Keep server-only data access behind the service/data layer.

## 8. Scope-creep test

Before adding any feature or dependency, answer:

1. Is it necessary for the core order-tracking workflow?
2. Is it needed for MVP validation by a real business?
3. Can it be implemented simply?
4. Does it add significant maintenance cost?
5. Can it safely be postponed?

If the answer shows it is not necessary, postpone it and record it on the roadmap rather than building it.

## 9. Exceptions

A prohibition may be changed only through an explicit approved requirement or documented architectural decision/change. Until then, the prohibition remains active.
