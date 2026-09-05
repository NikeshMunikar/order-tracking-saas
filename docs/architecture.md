# Architecture

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05  
Implementation State: Not Implemented

## 1. Architectural intent

The MVP is a modular monolith optimized for low cost, clarity, security, and a small inexperienced development team. It should solve the complete order-tracking workflow without introducing distributed-system machinery that is not justified by current requirements.

### Architecture rule IDs

- ARCH-001 — Modular monolith is the approved application shape.
- ARCH-002 — Server-side authorization and tenant-scoped data access are mandatory boundaries.
- ARCH-003 — Public tracking is a distinct unauthenticated trust boundary.
- ARCH-004 — UI code cannot directly execute arbitrary Prisma queries.
- ARCH-005 — Multiple-write order creation is one database transaction.

## 2. Runtime architecture

```text
Browser
  ↓
Next.js App Router
  ├─ Server Components
  ├─ Server Actions
  └─ Route Handlers (only where an actual HTTP endpoint is required)
  ↓
Authentication
  ↓
Business Membership / Authorization
  ↓
Zod Validation
  ↓
Application Service / Data Access Layer
  ↓
Prisma
  ↓
PostgreSQL
```

The browser is untrusted. Client calculations and identifiers are inputs, not authority.

## 3. Application boundaries

### Authorization domains — explicitly separate

The system has two separate authorization domains. They must never be conflated.

#### SaaS Platform / Company

The SaaS operator/company domain has exactly two platform roles:

- `SUPER_ADMIN` — highest-trust platform/company administration role.
- `ADMIN` — platform/company administration role below `SUPER_ADMIN`.

These roles are for the company operating the SaaS, not for customer businesses. Their detailed operational capabilities are intentionally not specified here; those capabilities remain an OPEN design matter until authoritative platform requirements are accepted. Do not invent a detailed permission matrix.

#### Customer Business / Tenant

The business authorization model has exactly two roles: `OWNER` and `STAFF`.

- `OWNER` has the approved full business-management capabilities defined by `MASTER_SPEC.md`.
- `STAFF` has the approved operational capabilities for customers, product viewing, orders, and order-status updates.
- `BusinessMember.role` must be restricted to `OWNER | STAFF`.
- `ADMIN` and `SUPER_ADMIN` must never be stored or interpreted as `BusinessMember.role` values.
- Do not introduce additional business roles, a role hierarchy, or a general-purpose permission engine merely to support the four-role model.

#### Mandatory authorization separation

Platform authorization and business/tenant authorization are independent security domains. A platform role does not automatically grant a user a customer-business membership or business role. Likewise, a business `OWNER` or `STAFF` role does not confer platform authority.

Platform administration must have its own server-side authentication/authorization boundary. Browser-supplied `businessId`, `userId`, `role`, or similar identifiers must never establish platform authority or switch authorization domains. Platform-authorized access to tenant-scoped data must be an explicitly authorized server-side operation with least-privilege treatment, tenant-scope validation, and appropriate audit/security controls.

Platform-role assignment must never be performed through ordinary tenant membership operations. Business users must not be able to self-elevate to `ADMIN` or `SUPER_ADMIN` through browser-controlled input.

This separation is an architecture/security boundary and is intentionally simple.

### Browser/UI boundary

Responsible for presentation, navigation, user interaction, client-friendly loading/error states, and non-authoritative display calculations. It must not own authorization, tenant ownership, financial correctness, or direct database access.

### Authentication boundary

Provided by exactly one selected production-ready authentication solution. The provider remains OPEN until DEC-001 is accepted. The application should map provider identity to the internal user/membership model without storing passwords in the application database unless the selected architecture explicitly requires it.

### Authorization boundary

Authentication establishes an identity; authorization determines what that identity may do. The server must first determine which authorization domain the operation belongs to.

For customer-business operations, the boundary is:

`Authentication → Business Membership Resolution → Business Role Authorization → Authorized Business Context → Validation → Tenant-Scoped Service`

For platform/company operations, the boundary is:

`Platform Authentication/Session → Platform Role Resolution → Platform Role Authorization → Authorized Platform Operation → Validation → Server-Side Service`

Business membership checks must not be substituted for platform-role checks, and platform authority must not be inferred from a browser-supplied business identifier or role. A platform administrator operating on tenant data must pass explicit server-side authorization and tenant-scope checks for the particular operation.

### Service/data boundary

Business operations should live in server-only modules organized around domain areas such as businesses, customers, products, and orders. These services should perform authorization and validation before calling Prisma.

### Database boundary

Prisma is the ORM boundary. PostgreSQL is the system of record for relational integrity, uniqueness, foreign keys, and transaction atomicity.

## 4. Multi-tenancy architecture

Use pooled multi-tenancy: one PostgreSQL database with shared tables and `businessId` on tenant-owned records.

```text
Authenticated User
      ↓
Membership in Business
      ↓
Authorized Business Context
      ↓
Tenant-Scoped Service Operation
      ↓
Prisma Query with Business Scope
      ↓
PostgreSQL
```

A caller must not be able to select an arbitrary business simply by supplying a different `businessId` in the browser. The server derives or verifies tenant context from authenticated membership.

PostgreSQL Row-Level Security is explicitly not required for MVP. It may be revisited later through an architectural/security review, not added opportunistically.

## 5. Domain modules

The application should keep domain logic grouped by capability and authorization domain:

- `platform` — reserved server-side boundary for future SaaS company administration; platform roles are `SUPER_ADMIN` and `ADMIN`. This is an authorization boundary, not an instruction to build platform UI or APIs now.
- `businesses` — business profile, onboarding, and settings.
- `customers` — tenant-scoped customer CRUD/search and historical relationships.
- `products` — tenant-scoped product CRUD and active/inactive state.
- `orders` — order creation/editing, calculations, status changes, tracking token, and status history.
- `auth` — provider/session integration and identity resolution.
- Shared `lib/security`, `lib/validation`, `lib/db`, and utilities should contain cross-cutting behavior only where that improves consistency.

Avoid creating a separate backend service. Keep HTTP exposure minimal: use Server Actions for in-app mutations and Route Handlers only when an actual endpoint is required, including the public tracking boundary if implemented that way.

## 6. Transaction boundaries

Order creation is one transaction. At minimum, the transaction includes:

1. Order record.
2. Required order items.
3. Secure public tracking token.
4. Initial status-history record.

If one required write fails, all required writes roll back. The system must not intentionally create a partially populated order.

Status changes that update both the current order status and its status-history record should likewise be atomic so the current state and historical record cannot intentionally diverge.

## 7. Concurrency architecture

Concurrency-sensitive invariants must not rely only on a preliminary “check then write.” The database and transaction semantics must participate.

Required examples:

- Unique business slug.
- Unique `(businessId, userId)` membership.
- Unique `(businessId, orderNumber)` order identifier.
- Unique public tracking token.
- Safe order-number allocation under concurrent order creation.
- Atomic current-status + history updates.

The exact order-number sequence mechanism is DEC-007 OPEN.

## 8. Public tracking boundary

The public route is planned as `/track/[token]`. It is intentionally unauthenticated and therefore distinct from authenticated business operations.

The public boundary must:

- Resolve only by a cryptographically secure tracking token.
- Avoid internal database identifiers in the URL.
- Return a deliberate public DTO rather than a raw ORM record.
- Include only the approved customer-facing fields.
- Exclude customer email, internal notes, staff information, internal IDs, authentication data, private business information, and internal operational information.
- Receive abuse protection/rate-limiting review before production release.

## 9. Financial authority boundary

The browser may display tentative totals, but the server independently validates inputs and recalculates authoritative monetary values before persistence.

The exact monetary storage strategy is DEC-006 OPEN. The implementation must use a database-safe representation that avoids JavaScript floating-point errors for authoritative calculations.

The supplied MASTER_SPEC section on order calculation contains malformed presentation; see `CURRENT_STATE.md` AMB-001. Do not finalize financial semantics by silently guessing.

## 10. Deployment architecture

```text
Browser
  ↓
Managed Next.js Hosting
  ↓
Managed PostgreSQL
```

The hosting and database providers remain implementation decisions (DEC-002 and DEC-003). The application must remain provider-agnostic enough that the core architecture does not depend on a particular vendor's free tier.

Expected environments:

```text
Development → Preview / Testing → Production
```

Each environment uses appropriate independent configuration and credentials.

## 11. Scalability philosophy

## 11A. Scalability and performance engineering standards

The modular monolith is the scaling unit for MVP. Scalability work must first improve module boundaries, query shape, indexes, transactions, and measured application performance.

Required engineering practices for growing datasets:

- Paginate potentially growing lists; do not load entire tables for list views.
- Select only fields needed by the operation or DTO.
- Use pagination for potentially large lists; avoid loading entire tables.
- Use selective field projection.
- Avoid N+1 query patterns and unnecessary round trips.
- Keep authentication/provider-specific code behind a clean boundary.
- Keep database access in server-only services/data modules.
- Keep business logic independent of UI components and independently testable.
- Avoid global mutable state and unnecessary cross-domain coupling.
- Use real query/access patterns to justify indexes and optimization.
- Measure before making major performance claims.

These rules do not authorize Redis, queues, microservices, GraphQL, Elasticsearch, Kubernetes, or other distributed infrastructure prohibited by `DO_NOT_BUILD.md`.

Scale the modular monolith only when actual usage or a concrete requirement justifies it. Prefer adding clarity, constraints, indexes, and query efficiency before adding distributed infrastructure. The architecture is intended to support future notification adapters without building them now.

## 12. Future extension seam

The source specification anticipates a future notification layer between order status changes and provider adapters such as WhatsApp, SMS, email, or Messenger. MVP code may preserve clean service boundaries for this future seam, but no fake notification service or provider integration should be implemented merely for architectural appearance.

## 13. Architectural constraints

- Next.js App Router only; no Pages Router.
- One application and one primary database for MVP.
- No microservices, Kubernetes, Redis, Kafka, GraphQL, Elasticsearch, or distributed event infrastructure unless an approved later requirement changes the architecture.
- Server-only code must be clearly separated and may explicitly use `import "server-only"` where appropriate.
- UI must not contain Prisma database logic.
