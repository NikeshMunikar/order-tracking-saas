# Testing Strategy

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-10-19  
Implementation State: Implemented in delivered-milestone scope — `node:test` unit and DB-backed integration suites exist through M7/M8, and M9 added the Playwright E2E suites (§8/§9 record where each part landed); planning sections for future milestones remain planned.

## 1. Testing principles

Testing priority follows business and security risk. The most important tests prove that a real business can complete the core workflow and that one tenant cannot reach another tenant's data.

TEST-001 — Tenant isolation.  
TEST-002 — Server-authoritative financial calculations.  
TEST-003 — Order/status atomicity and historical integrity.  
TEST-004 — Public tracking data boundary.  
TEST-005 — Authentication and OWNER/STAFF authorization.  
TEST-006 — End-to-end core workflow.

## 2. Test layers

### Unit tests

Use the eventual accepted unit framework (DEC-004 OPEN) for pure logic such as validation, transition rules, token helpers, formatting, and financial calculations that can be tested independently.

### Integration/service tests

Exercise server actions/services with a real or test PostgreSQL environment where practical. Test authorization and tenant scoping at the data/service boundary rather than relying only on UI tests.

### Database tests

Verify unique constraints, foreign keys, transaction rollback, historical integrity, and concurrent invariant protection.

### E2E tests

Use Playwright, which is explicitly approved by the source, for the critical user journey and high-value UI states.

## 3. Authentication tests

At minimum:

- Unauthenticated user cannot access protected dashboard functionality.
- Valid authenticated user can access authorized business data.
- Invalid/expired sessions are rejected safely.
- Business membership is required.
- OWNER and STAFF behaviors match approved capabilities.
- Authentication flows provided by the selected provider work in the chosen environment.

## 3A. Platform/business authorization-domain tests

The authorization domains require explicit negative and boundary testing even before implementation exists. Once platform administration is implemented, tests must prove:

- `SUPER_ADMIN` is recognized only as a platform/company role.
- `ADMIN` is recognized only as a platform/company role.
- `BusinessMember.role` accepts only `OWNER` and `STAFF`.
- A business `OWNER` cannot gain platform privileges by modifying browser input.
- A business `STAFF` cannot gain platform privileges by modifying browser input.
- Tenant APIs reject attempts to set `ADMIN` or `SUPER_ADMIN` as business roles.
- A browser cannot switch authorization domains through a supplied role, `businessId`, `userId`, or similar identifier.
- Platform role checks are enforced server-side.
- Platform-role escalation attempts are rejected.
- Same identifiers across authorization domains cannot cause IDOR/BOLA.
- Any future platform administration endpoint requires platform authorization and does not rely on business membership checks alone.
- Any platform-authorized tenant operation still enforces explicit tenant scope and does not disable tenant isolation.

## 4. Tenant-isolation tests

Required negative tests:

- Business A cannot read Business B orders.
- Business A cannot update Business B orders.
- Business A cannot delete Business B orders.
- Business A cannot read Business B customers.
- Business A cannot read Business B products.
- A user cannot switch business scope merely by changing a browser-supplied `businessId`.

Also test same-resource identifiers across tenants to catch IDOR/BOLA failures.

## 5A. Mandatory negative cross-tenant coverage

Automated tests must prove:

- Business A cannot read Business B orders.
- Business A cannot update Business B orders.
- Business A cannot delete Business B orders.
- Business A cannot read Business B customers.
- Business A cannot read Business B products.
- Changing a browser-supplied `businessId` cannot switch authorization context.

Authorization tests must cover exactly `OWNER` and `STAFF` and must not introduce additional business roles.

## 5. Order and financial tests

Test:

- Order creation.
- At least-one-item requirement.
- Quantity validation.
- Product active/inactive behavior.
- Item subtotal calculation.
- Discount semantics once resolved.
- Delivery-fee validation.
- Authoritative total calculation.
- Manual payment status changes.
- Delivery/pickup fields.
- Historical product-name/price snapshots.
- Historical delivery-address snapshot.
- Rollback when any required order-creation step fails.

Do not accept client-provided totals as truth in tests or implementation.

## 6. Concurrency tests

At minimum, design verification for:

- Concurrent order creation producing unique order numbers within the same business.
- Concurrent creation of duplicate business slugs being rejected correctly.
- Concurrent duplicate membership creation being rejected by the unique constraint.
- Current order status and status history remaining consistent under concurrent status-update attempts according to the final transition model.

The exact order-number generation test depends on DEC-007.

## 7. Tracking tests

Test:

- Valid token resolves the correct order.
- Invalid token is safely rejected.
- Token lookup does not rely on internal sequential IDs.
- Public response contains approved fields only.
- Customer email and internal/private fields are absent.
- Public tracking works without a customer account.
- Status changes are reflected in the timeline.
- Abuse-protection behavior is verified once the production design is selected.

## 8. E2E critical path

```text
Register
 → Create Business
 → Add Product
 → Add Customer
 → Create Order
 → Copy Tracking URL
 → Open Tracking URL
 → Update Order Status
 → Verify Customer Sees New Status
```

This is the highest-value complete workflow in the MVP.

**Implemented in M9 (`e4a184a`).** Playwright drives the exact chain above through the real UI (`tests/e2e/critical-path.spec.ts`): registration with a fresh account, signing in, creating the business, product, customer and order, extracting the tracking link from the order's "Customer tracking link" card, opening `/track/[token]` and verifying the customer-facing order (items, amounts, default status), then confirming the order and re-checking the tracking page renders the updated status ("Order confirmed"). A second spec (`tests/e2e/rate-limit.spec.ts`) proves the DEC-015 abuse-protection boundary: 60 requests from one identity keep rendering the generic invalid-link state and the next one renders the generic throttled state.

Run with `npm run test:e2e` (first sets up the dedicated E2E database, then `playwright test`). The suite runs against the dedicated `_e2e` database only (derived from `DATABASE_URL` by replacing the trailing `_dev` suffix — see `tests/helpers/e2e-database-url.mjs` and `tests/helpers/setup-e2e-db.mjs`), never against the development database, the `_test` verification database or production. The dev server for the suite is started on port 3113 with the E2E database URL only. The E2E database accumulates disposable run data; it is never reset automatically and never used by any other suite.

## 9. UI/responsive testing

Verify critical screens at common desktop, tablet, and mobile widths. At minimum validate tracking, order creation, status update, dashboard, and form behavior. Include keyboard/accessibility checks for the critical workflow.

**Performed in M9** (manual Playwright-driven browser pass at 375×812, 768×1024 and 1440×900 against the development server). The pass covered tracking, the M8 dashboard, the orders list, order creation, order detail with the status form, sign-in and registration. It found and fixed two real mobile-layout defects (`21bbb83`) — the business-sections navigation and the order-form item row overflowed the viewport at 375 px — and otherwise verified that all critical screens fit without horizontal page overflow at all three widths (wide tables scroll in place inside contained `overflow-x-auto` wrappers). The keyboard pass verified tab order and keyboard operation of the critical workflow: registration field order, the order-status form (Tab to the radio, Space to select, Enter to submit with the "Status updated to Confirmed." feedback), and the sign-in flow. Findings are recorded in `CURRENT_STATE.md` §3K.

## 10. Migration verification

Every schema change requires a migration. Test that migrations apply cleanly to a clean database and that the deployed application version remains compatible. Destructive migrations require explicit review.

## 11. CI/release gates

A milestone or release should not be considered complete until applicable gates pass:

- Tests.
- Type checking.
- Linting.
- Production build.
- Migration verification.
- Core manual workflow verification.
- Security checks appropriate to the changed area.

The source explicitly requires these checks after every milestone.

## 12. Test data

Use deterministic development/test fixtures derived from the source seed examples. Never commit real customer data, real credentials, or production secrets.

## 13A. Scalability/data-access verification

For growing list operations, verify pagination, tenant-aware filtering, selective projection, and absence of N+1 query patterns. Performance claims require evidence; do not introduce infrastructure based only on theoretical load.

## 13. Failure evidence

A failed test is evidence that the implementation does not currently satisfy the tested behavior. Do not mark the corresponding feature VERIFIED until the failure is resolved and the verification reruns successfully.
