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
- Public tracking token is random, unpredictable, unique, and not ID-derived.
- Authoritative money avoids binary floating-point; DEC-006 is open for exact persistence strategy.
- Order-number generation must stay unique under concurrency; DEC-007 is open.
- Growing lists use pagination and efficient query shapes; avoid N+1/full-table loading.
