# Database Design

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05  
Implementation State: Not Implemented

## 1. Persistence principles

PostgreSQL is the approved relational database. Prisma is the approved ORM. The logical schema below represents approved requirements and narrowly justified implementation details; it is **not** a Prisma schema and must not be treated as implementation evidence.

DB-001 — Tenant-owned records require a tenant key (`businessId`) where the approved model identifies the record as business-owned.

DB-002 — Required relational integrity must be enforced with foreign keys and uniqueness constraints.

DB-003 — Historical order information must survive later customer/product changes.

DB-004 — Concurrency-sensitive invariants must use database constraints and transaction semantics, not only application pre-checks.

## 2. Logical entities

### User

The membership model requires an application-level user identity to relate authentication identity to business memberships. The source permits a user/profile record containing:

- `id`
- `authProviderUserId`
- `name`
- `createdAt`
- `updatedAt`

Do not store passwords unless the selected authentication architecture explicitly requires it; the approved baseline is to avoid application-managed passwords.

### Business

Core fields:

- `id`
- `name`
- `slug` — unique
- `logoUrl`
- `phone`
- `email`
- `address`
- `description`
- `currency`
- `timezone`
- `createdAt`
- `updatedAt`

### BusinessMember

- `id`
- `businessId`
- `userId`
- `role` — `OWNER` or `STAFF`
- `createdAt`
- `updatedAt`

Constraint: unique `(businessId, userId)`.

### Customer

- `id`
- `businessId`
- `name`
- `phone`
- `email` nullable
- `address` nullable
- `notes` nullable
- `createdAt`
- `updatedAt`
- `deletedAt` nullable

Customers support soft deletion where required to preserve historical relationships.

### Product

- `id`
- `businessId`
- `name`
- `description` nullable
- `price` — `DECIMAL(12, 2)` (DEC-006 ACCEPTED; string-backed Prisma `Decimal`, never a JavaScript number)
- `active`
- `createdAt`
- `updatedAt`
- `deletedAt` nullable

Inactive/soft-deleted products must not be selectable for new orders. Inactive products remain listed for the tenant (status flag only); historical orders keep their recorded name/price snapshots regardless of later product edits.

### Order

- `id`
- `businessId`
- `customerId`
- `orderNumber`
- `status`
- `subtotal`
- `discount`
- `deliveryFee`
- `total`
- `deliveryType` — `DELIVERY` or `PICKUP`
- `deliveryName`
- `deliveryPhone`
- `deliveryAddress`
- `estimatedDeliveryAt` nullable
- `paymentStatus` — `UNPAID`, `PAID`, `PARTIALLY_PAID`, `REFUNDED`
- `notes`
- `publicTrackingToken`
- `createdAt`
- `updatedAt`

The order number (`orderNumber`) is unique within a business. **DEC-007 is ACCEPTED (2026-10-18, strategy (a)):** a per-business transactional counter (`business_order_sequences`), allocated under a row lock inside the order-creation transaction, rendering `ORD-1001`-style numbers with the `(businessId, orderNumber)` composite unique as backstop. See §7.

`publicTrackingToken` must be unique and cryptographically secure. It must not be derived from a sequential database ID. **Implemented in M5:** a raw 256-bit base64url token from the M2 token helper (`generateSecureToken`), stored unhashed because the token itself IS the lookup key for the future public tracking page — unlike invitations (which hash at rest per DEC-012), there is no authenticated context around the lookup.

### OrderItem

- `id`
- `orderId`
- `productId` nullable
- `productNameSnapshot`
- `unitPrice`
- `quantity`
- `subtotal`

Historical snapshots are mandatory: product name and price at order time must not change when the current product record changes. `productId` may be nullable to preserve historical items even when the product no longer exists as an active record.

### OrderStatusHistory

- `id`
- `orderId`
- `oldStatus`
- `newStatus`
- `changedBy`
- `note` nullable
- `createdAt`

Every valid order status change must create a history record.

## 3A. Authorization-domain separation

The persistence model must keep platform/company authorization separate from customer-business membership.

### Platform/company authorization

The platform/company domain has exactly two roles:

- `SUPER_ADMIN`
- `ADMIN`

These roles represent the SaaS operator/company side. They are not customer-business membership roles. The exact platform identity/company schema and storage model are not yet authoritative and must not be invented merely to complete this documentation; the eventual design must be recorded through the ADR process before implementation.

### Customer-business authorization

`BusinessMember.role` is a closed domain of exactly two values: `OWNER` and `STAFF`.

Therefore:

`BusinessMember.role ∈ { OWNER, STAFF }`

No `ADMIN`, `SUPER_ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`, or other platform/company role may appear as a `BusinessMember.role` value. The database representation, Prisma schema, validation, authorization code, and tests must all preserve this closed business role set.

Do not create one global role enum that makes platform and tenant authorization ambiguous. Platform/company roles and business membership roles must have separate concepts/models/boundaries.

A platform role must not be treated as a business role, and a business role must not be treated as a platform role. Platform-authorized tenant access, if later implemented, must remain an explicitly authorized server-side operation and must preserve tenant isolation.

## 3. Relationship map

```text
User
  │
  └──< BusinessMember >── Business
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          Customers        Products         Orders
                                               │
                              ┌────────────────┴───────────────┐
                              ▼                                ▼
                         OrderItems                  OrderStatusHistory
```

Required ownership relationships:

- `BusinessMember.businessId → Business.id`
- `BusinessMember.userId → User.id`
- `Customer.businessId → Business.id`
- `Product.businessId → Business.id`
- `Order.businessId → Business.id`
- `Order.customerId → Customer.id`
- `OrderItem.orderId → Order.id`
- `OrderItem.productId → Product.id` when non-null
- `OrderStatusHistory.orderId → Order.id`
- `OrderStatusHistory.changedBy` represents the user responsible for the change according to the approved status-history model; exact relational treatment must remain consistent with the final identity model.

Where cross-tenant relationships are possible, the service layer must validate same-business ownership. The implementation may add database-level composite constraints where they materially strengthen the invariant without changing approved behavior; that is an implementation decision, not a product requirement.

## 4. Index strategy

Create indexes for actual high-value access paths. The source requires considering:

- `Business.slug`
- `BusinessMember.businessId`
- `BusinessMember.userId`
- `Customer.businessId`
- `Customer.phone`
- `Product.businessId`
- `Product.active`
- `Order.businessId`
- `Order.customerId`
- `Order.status`
- `Order.createdAt`
- `Order.publicTrackingToken`
- `OrderItem.orderId`
- `OrderStatusHistory.orderId`
- `OrderStatusHistory.createdAt`

Useful compound indexes include `(businessId, createdAt)`, `(businessId, status)`, and `(businessId, orderNumber)`.

Indexes are not to be added blindly; each should correspond to a real query pattern or constraint need.

Implemented so far (matching the access paths above): `Customer` compound indexes `(businessId, createdAt)` and `(businessId, phone)`; `Product` compound indexes `(businessId, createdAt)` and `(businessId, active)` (the latter serves the active-only order-creation picker); `Order` indexes `(businessId, createdAt)` and `(businessId, status)` plus the `(businessId, orderNumber)` unique composite; `OrderItem.orderId` and `OrderStatusHistory(orderId, createdAt)` (implemented in M5).

## 5. Uniqueness and tenant integrity

At minimum:

- `Business.slug` unique.
- `BusinessMember(businessId, userId)` unique.
- `Order(businessId, orderNumber)` unique.
- `Order.publicTrackingToken` unique.

For public tracking, uniqueness is global because token-based lookup does not authenticate a business context.

## 6. Monetary persistence

The source requires database-safe money representation and avoidance of unsafe floating-point authoritative calculations. **DEC-006 is ACCEPTED (2026-10-18):** PostgreSQL decimals via Prisma `Decimal` — monetary columns use `@db.Decimal(12, 2)`, and app-visible `Decimal` values are string-backed and must be treated as strings, never as JavaScript numbers. First applied to `Product.price` (M4).

Regardless of the final representation:

- Server is authoritative for calculations.
- Inputs are validated before calculation.
- Client-supplied totals are never persisted as truth.
- Values must remain deterministic through persistence and retrieval.
- Financial calculation tests must cover positive, zero, boundary, discount, and fee cases supported by the final semantics.

The supplied MASTER_SPEC order-calculation text is malformed; this was tracked as `CURRENT_STATE.md` AMB-001. **AMB-001 is RESOLVED (2026-10-18, owner-confirmed):** `total = subtotal + deliveryFee − discount`, where the discount is a fixed NPR amount; a discount that would drive the total below zero is REJECTED, never clamped ("Discount cannot create an invalid total"). Loading- and line-level arithmetic happens only in `src/lib/money.ts` on BigInt minor units.

## 7A. Financial correctness requirements

Authoritative financial calculations must be performed server-side from authoritative product data and validated order inputs. Client-provided subtotal, total, price, discount, delivery fee, or payment status is never authoritative.

The persisted representation must avoid binary floating-point semantics for authoritative money values. DEC-006 is ACCEPTED: `DECIMAL(12, 2)` monetary columns via Prisma `Decimal` (see §6). **The M5 order money columns (`subtotal`, `discount`, `deliveryFee`, `total`, and `unitPrice`/`subtotal` on items) use exactly this representation.**

## 7. Order creation transaction

Order creation must atomically include the order, required order items, public tracking token, and initial status history. If any required write fails, the database transaction must roll back.

**Implemented this way in M5:** one interactive transaction writes the order (with the DEC-007(a) allocated `orderNumber`), the item lines, the raw 256-bit `publicTrackingToken`, and the initial `OrderStatusHistory` row (`oldStatus: null`, `newStatus: PENDING`); membership is re-verified and product prices are snapshotted inside the same transaction, so nothing leaks on failure. `DEC-007` is ACCEPTED (2026-10-18, owner-confirmed strategy (a)): per-business transactional counter — the sequence row is locked and incremented by one atomic `INSERT … ON CONFLICT … DO UPDATE … RETURNING` statement, numbers render `ORD-1001`-style (first order `ORD-1001`, roughly gap-free per business), independent of internal record IDs, with the `(businessId, orderNumber)` unique composite as the persistence backstop. This row-locked allocation is verified by a genuine multi-connection integration test (`tests/integration/order-concurrency.test.ts`, commit `34494f3`): 8 simultaneous `createOrder` calls for one business yield the unique numbers `ORD-1001`–`ORD-1008` (one item line and one initial `PENDING` history row each, `lastNumber = 8`), while an independent `pg_stat_activity` observer confirms several concurrently active backends (peak 5–6 across 8 distinct backend PIDs).

## 8. Status transition integrity

Current statuses are:

`PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`

`CANCELLED` may be entered before delivery according to the source. Invalid transitions must be rejected.

**AMB-002 is RESOLVED (2026-10-18, owner-confirmed; recorded as DEC-013 in `docs/architecture-decisions.md`).** The authoritative allowed transitions are:

| Current status | Allowed next statuses |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `READY`, `CANCELLED` |
| `READY` | `OUT_FOR_DELIVERY`, `CANCELLED` |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `CANCELLED` |
| `DELIVERED` | — (terminal) |
| `CANCELLED` | — (terminal) |

Forward progress is exactly one step (no skipped or backwards transitions); `CANCELLED` is reachable from every pre-delivery status but never from `DELIVERED`; both `DELIVERED` and `CANCELLED` are terminal, so there is no reopening/correction path. A status-change note is optional free text.

The matrix is encoded once in `src/lib/order-status.ts` and enforced server-side in the order service regardless of which controls the UI renders (Milestone 6 / DEC-013).

Every accepted status change updates the order's current status and appends its history record atomically.

## 9. Historical data integrity

Order items preserve `productNameSnapshot` and `unitPrice`. Orders preserve `deliveryName`, `deliveryPhone`, and `deliveryAddress` so that later edits to customer/product records do not rewrite historical orders.

Soft deletion is a lifecycle strategy, not a replacement for history. Historical order items must remain readable even after a product is deactivated or soft-deleted.

## 10. Migration policy

Schema changes must be represented by version-controlled Prisma migrations. Production databases must not be modified manually as a substitute. Destructive migrations require explicit review. Migration failures block release until resolved.

The migration state must remain compatible with the deployed application version.

## 11A. Growth and query-shape requirements

As list volumes increase, application services must use pagination, selective field projection, tenant-aware filtering, and indexes derived from actual access patterns. Query plans and N+1 behavior should be verified before adding infrastructure.

Concurrency-sensitive uniqueness and allocation rules must remain backed by database constraints/transactions rather than application pre-checks alone.

## 11. Seed/test data principles

The source provides realistic development seed examples:

- Business: Kathmandu Bakery.
- Products: Chocolate Cake — NPR 1800; Red Velvet Cake — NPR 2200; Birthday Box — NPR 700.
- Customers: Ram Sharma, Sita Thapa, Hari Gurung.
- Orders: multiple statuses.

These are development data only; no production credentials or secrets belong in seed data.
