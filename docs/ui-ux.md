# UI / UX

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05  
Implementation State: Not Implemented

## 1. UX objective

The interface should feel like a legitimate commercial SaaS product while remaining simple enough for a non-technical small-business operator. The core experience is fast order creation and an excellent customer tracking page.

UI-001 — The order creation screen is the highest-priority authenticated interface.

UI-002 — The public tracking page is the highest-priority customer interface.

UI-003 — Mobile usability is a first-class requirement, especially for tracking and status updates.

## 2. Information architecture

Primary business navigation:

- Dashboard
- Orders
- Customers
- Products
- Settings

The public tracking route is separate from the authenticated dashboard hierarchy: `/track/[token]`.

## 3A. Human-designed interface standard

The UI must be intentionally designed for the actual workflows rather than assembled from a generic AI/SaaS dashboard pattern.

Prioritize visual hierarchy, typography, spacing rhythm, alignment, information density, restrained color, useful interaction states, clear affordances, natural grouping, mobile ergonomics, and accessibility.

Avoid gratuitous gradients, glassmorphism, decorative blobs/glows, excessive rounded cards, excessive shadows, huge application-page hero sections, gratuitous animation, generic AI-dashboard aesthetics, overuse of pills/badges, card-for-everything layouts, fake analytics, and whitespace that harms operational efficiency.

Reusable primitives should cover common controls and states, but page-specific composition is allowed when it better serves the information architecture.

## 3. Visual design principles

The source requires:

- Clean.
- Minimal.
- Professional.
- Fast.
- Mobile-first.
- Accessible.
- Easy for non-technical business owners.

Avoid excessive gradients, animations, charts, decorative UI, and enterprise-style complexity.

Where exact visual tokens are not defined by the product source, use an implementation-level design-system decision rather than inventing product behavior. A future accepted design decision may define exact color tokens, type scale, spacing scale, and component variants.

## 3B. Platform administration UI boundary

If platform administration is implemented later, it should be a purposeful internal operations interface for the SaaS company rather than a copy of the customer-business dashboard. It should retain the human-designed standards in this document while using context-appropriate density, hierarchy, navigation, and interaction patterns for internal operations.

This is a design boundary only. Do not invent platform screens, workflows, or feature requirements before authoritative platform requirements exist.

## 4. Responsive behavior

Support:

- Desktop.
- Tablet.
- Mobile.

Tracking must be excellent on mobile. Business users must be able to perform essential order-management operations from phones.

Tables should become cards or horizontally scroll when appropriate rather than forcing unreadable columns.

Forms should be touch-friendly, with clear labels, validation, and predictable submission behavior.

## 5. Dashboard

Dashboard should display:

- Today's orders.
- Pending.
- In progress.
- Delivered.
- Recent orders.

Analytics remain intentionally basic. Do not turn the dashboard into an advanced BI product.

## 6. Order management

The order creation workflow should minimize steps and cognitive load.

Required interaction sequence:

```text
Customer
 → search existing or create new customer
 → add products and quantities
 → delivery/pickup
 → delivery information when applicable
 → discount
 → delivery fee
 → payment status
 → estimated delivery when applicable
 → notes
 → create order
```

After successful creation, the user should be able to view the order, copy the tracking link, and share it through the browser Web Share API where available, with copy-link fallback.

Client-side totals may be shown for convenience but must not be treated as authoritative.

## 7. Order detail and status

The order interface should make current status and the next reasonable business action obvious. Status updates should be easy on mobile.

The approved statuses are:

`PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.

The UI must not offer transitions that the server rejects. The server remains authoritative.

## 8. Customer management

Customer list should support search and show at least name, phone, order count, and last order according to source examples.

Customer detail should show name, phone, email, address, and order history. Do not add marketing automation.

## 9. Product management

Product UI should support:

- Create.
- Edit.
- Activate/deactivate.
- Search.

Fields are name, description, price, active state. Inventory, variants, warehousing, supplier management, and purchasing are excluded.

## 10. Public tracking page

Route: `/track/[token]`.

It should be mobile-first and should make current status immediately understandable.

Approved content includes:

- Business logo/name.
- Order number.
- Order items.
- Quantities.
- Prices.
- Total.
- Current status.
- Status timeline.
- Estimated delivery if provided.
- Delivery/pickup information.
- Basic business contact information.

Approved exclusions include customer email, internal notes, staff information, internal IDs, authentication data, private business information, and internal operational information.

A typical visual structure is:

```text
Business identity

Order #ORD-1042

Status timeline
✓ Confirmed
✓ Preparing
● Ready
○ Out for Delivery
○ Delivered

Estimated delivery

Order items

Total

Delivery / pickup information

Basic business contact
```

The actual styling may vary, but the information hierarchy must keep status and order summary prominent.

## 11. Sharing

Provide copy-to-clipboard. Use Web Share API when supported, with copy fallback. Do not integrate WhatsApp APIs merely to make sharing look native.

## 12A. Interaction quality standard

Every important interaction must define meaningful idle, loading, success, error, empty, unauthorized, not-found, and disabled states as applicable. Duplicate submissions must be prevented. Errors must tell the user what they can do next without exposing implementation details.

Mobile is a first-class workflow, not merely a shrunken desktop. Tracking, order creation, status updates, customer lookup, product selection, and copy/share actions must remain touch-friendly and legible.

## 12. States

Every important page should represent:

- Loading.
- Empty.
- Success.
- Error.
- Unauthorized.
- Not found.

Examples from source:

- No orders: “No orders yet. Create your first order to start tracking customer deliveries.”
- Invalid tracking link: “This tracking link is invalid or no longer available.”
- Unauthorized: “You don't have permission to access this business.”

Do not expose raw server/database errors.

## 13. Accessibility

Accessibility is an approved design principle. Implementation should use semantic HTML, label form controls, preserve visible focus, maintain usable contrast, support keyboard interaction for business workflows, and provide meaningful status/error messaging. Exact component-level design tokens remain implementation details.

## 14. Destructive actions

Where an action can remove or deactivate a resource or change important business state, provide a clear confirmation or equivalent affordance appropriate to the risk. The server must still enforce the action regardless of UI confirmation.

Because soft deletion is required for historical integrity, deletion UI for customers/products must not imply irreversible database erasure when the underlying operation is a soft delete.
