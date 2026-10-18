# Database Context

- PostgreSQL + Prisma; version-controlled migrations only.
- Core entities: User, Business, BusinessMember, Customer, Product, Order, OrderItem, OrderStatusHistory.
- Platform/company roles are `SUPER_ADMIN | ADMIN`; customer-business membership role is exactly `OWNER | STAFF`.
- `BusinessMember.role` is exactly `OWNER | STAFF`; never store platform roles there. Unique `(businessId,userId)`.
- Exact platform identity/company persistence is not yet authoritative; record the final schema through an ADR before implementation.
- Tenant-owned access must be business-scoped; use FKs, unique constraints, and tenant-aware indexes.
- Historical product name/price and order delivery details are snapshots.
- Order creation transaction: Order + OrderItems + tracking token + initial history.
- Status + history changes must remain atomic.
- Public tracking token is random, unpredictable, unique, and not ID-derived. **M7 (`ad560f5`) makes the lookup live:** `/track/[token]` resolves the order by the globally unique raw `publicTrackingToken` through `getPublicTrackingOrder` (the only unauthenticated data path — no tenant/order id is accepted from the browser) and returns a deliberate customer-facing DTO only (no internal ids, no customer email/notes, no order notes, no history note/actor, never the raw token; see `docs/database.md` §8A). Malformed and unknown tokens both render the same invalid state; the token is never logged.
- Authoritative money avoids binary floating-point; DEC-006 is ACCEPTED (2026-10-18): Prisma `Decimal` with `@db.Decimal(12, 2)` columns; app-visible money values are string-backed and must not be handled as JavaScript numbers. First applied to `Product.price` (M4).
- Order-number generation stays unique under concurrency via DEC-007 (ACCEPTED 2026-10-18, strategy (a): per-business transactional counter, allocated under a row lock with one atomic `INSERT … ON CONFLICT … DO UPDATE … RETURNING` inside the creation transaction); verified by a real multi-connection integration test (`34494f3`).
- Order status transitions follow DEC-013 (ACCEPTED 2026-10-18, resolves AMB-002; M6): exactly one step forward (`PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`), `CANCELLED` reachable from every pre-delivery status, `DELIVERED`/`CANCELLED` terminal, optional note; the matrix lives in `src/lib/order-status.ts` and is enforced server-side, and a status change writes its status + history row in one transaction with the update guarded on the expected current status so a stale/concurrent change writes no history row (migration `20261018144203_add_cancelled_order_status`).
- Growing lists use pagination and efficient query shapes; avoid N+1/full-table loading.
