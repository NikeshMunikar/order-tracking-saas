MASTER PROMPT — LOW-COST MULTI-TENANT ORDER TRACKING SaaS MVP

IMPORTANT WORKING RULES

Do not make major architectural decisions silently.

If there are multiple reasonable approaches, briefly compare them and choose the simplest option appropriate for this MVP.

Do not introduce a new technology, service, dependency, or architectural pattern unless there is a clear reason.

Prioritize simplicity, reliability, security, and low operating cost over theoretical scalability.

Do not assume that a feature is required simply because it could be useful in the future.

When requirements conflict, prioritize:

1. Security
2. Core business workflow
3. Simplicity
4. Maintainability
5. Cost
6. Future scalability

ROLE
Act as a senior SaaS architect, full-stack engineer, database designer, security engineer, UX designer, QA engineer, and technical product manager.

You are helping a small startup with a limited budget and a relatively inexperienced development team build its first commercial SaaS MVP.

Your job is NOT to build the biggest possible system.

Your job is to build the smallest commercially useful, secure, maintainable, and extensible product that can be tested with real businesses.

The product will initially target small businesses such as:

Restaurants
Bakeries
Home food businesses
Instagram/Facebook sellers
Small retailers
Local delivery businesses
The initial market may be Nepal, but the architecture should not hard-code Nepal-specific assumptions that prevent future international expansion.

REQUIREMENT DISCIPLINE

Do not silently remove, replace, or significantly alter a requirement in this specification.

If you believe a requirement should change, explain:

- The current requirement
- The problem with it
- Your proposed change
- Why the change is better
- The impact on cost and complexity

Wait for approval before making a significant change.

1. PRODUCT VISION
   The long-term vision is a conversational commerce platform where businesses can manage orders and communicate with customers through channels such as:

WhatsApp
Messenger
Instagram
SMS
Email
AI conversational ordering
However, NONE of those advanced integrations should be built in the MVP unless explicitly specified below.

The MVP is:

A simple SaaS platform that allows businesses to create and manage customer orders and give customers a professional public order-tracking page.

The core workflow is:

Business registers
↓
Creates business profile
↓
Adds products
↓
Adds customer
↓
Creates order
↓
System generates tracking link
↓
Business copies/shares link manually
↓
Customer opens tracking page
↓
Business updates order status
↓
Customer sees updated status
↓
Order delivered

This workflow is the product.

Everything else is secondary.

2. MVP SUCCESS CRITERION
   A real business should be able to use the application without developer assistance.

The following workflow must work reliably:

Register
→ Business setup
→ Add product
→ Add customer
→ Create order
→ Generate tracking link
→ Share link
→ Customer opens link
→ Business changes status
→ Customer sees updated status
→ Order completed

If this workflow is excellent, the MVP is successful.

Do not sacrifice this workflow to build secondary features.

3. STRICT MVP SCOPE
   BUILD
   Authentication
   Use exactly ONE authentication solution.

Preferred approach: choose the lowest-complexity authentication solution that provides secure production-ready authentication at low initial cost.

Consider Supabase Auth, Clerk, and Auth.js, but choose ONE.

Do not implement multiple authentication providers.

Explain the choice before implementation.

Do NOT implement password hashing or authentication infrastructure manually.

Required:

Registration
Login
Logout
Password reset
Session management
Protected dashboard routes
Do not create a custom password system.

4. BUSINESS ACCOUNT
   A user can belong to one or more businesses through a membership model.

Business fields:

id
name
slug
logoUrl
phone
email
address
description
currency
timezone
createdAt
updatedAt

The first user who creates a business becomes OWNER.

Roles:

OWNER
STAFF

For MVP:

OWNER:

Full business management
Products
Customers
Orders
Settings
STAFF:

View/create/update customers
View/create/update orders
View products
Update order statuses
Do not build a sophisticated permissions engine.

5. MULTI-TENANCY
   This is a critical security requirement.

Use a pooled multi-tenant PostgreSQL architecture.

Each business is a tenant.

Tenant-owned tables must contain:

businessId

Examples:

Customer.businessId
Product.businessId
Order.businessId
BusinessMember.businessId

All database access must enforce tenant isolation server-side.

Example:

getOrder(orderId, businessId)

NOT:

getOrder(orderId)

The server must verify that the authenticated user is a member of the business before accessing business data.

Never trust a businessId supplied by the browser.

Determine the user's allowed business context from their authenticated session/membership.

6. DO NOT IMPLEMENT DATABASE RLS FOR MVP
   RLS is not required for the initial MVP.

Use centralized server-side authorization and tenant-scoped data-access functions as the primary isolation mechanism.

Do not introduce RLS unless there is a clear security or architectural reason.

If RLS would materially improve security without creating disproportionate complexity, explain the tradeoff before introducing it.

The application should enforce tenant isolation through a centralized server-side data access/service layer.

Example:

UI
↓
Server Action
↓
Authentication
↓
Business Membership Authorization
↓
Service/Data Access Layer
↓
Prisma
↓
PostgreSQL

This keeps the architecture understandable for a small inexperienced team.

RLS may be considered in a later security review when the product has meaningful production usage.

7. TECHNOLOGY STACK
   Use:

Frontend
Next.js
React
TypeScript
Tailwind CSS
Framework architecture
Use:

Next.js App Router only.

Do not use Pages Router.

Backend
Use the Next.js server environment.

Prefer:

Server Components
Server Actions
Route Handlers only when an HTTP endpoint is actually required
Do NOT create a separate backend server for the MVP.

Database
PostgreSQL.

ORM
Prisma.

Validation
Use Zod or another mature TypeScript validation library.

All important inputs must be validated server-side.

Hosting
Use an inexpensive managed deployment such as Vercel or another appropriate platform.

Do not make the architecture dependent on a free tier.

The goal is:

Very low cost during early validation, with a straightforward path to paid infrastructure as customers increase.

8. DATABASE SCHEMA
   Create a normalized relational schema.

User
Authentication identity should primarily be managed by the selected auth provider.

If an application-level user/profile table is required, it should contain:

id
authProviderUserId
name
createdAt
updatedAt

Do NOT store passwords unless the selected authentication architecture explicitly requires it.

Business
id
name
slug
logoUrl
phone
email
address
description
currency
timezone
createdAt
updatedAt

Add a unique constraint on slug.

BusinessMember
id
businessId
userId
role
createdAt
updatedAt

Constraints:

unique(businessId, userId)

Customer
id
businessId
name
phone
email nullable
address nullable
notes nullable
createdAt
updatedAt
deletedAt nullable

Customers should not be physically deleted if doing so would break historical order relationships.

Product
id
businessId
name
description nullable
price
active
createdAt
updatedAt
deletedAt nullable

Inactive products cannot be added to new orders.

Historical orders remain unchanged.

9. ORDER MODEL
   Order:

id
businessId
customerId
orderNumber
status
subtotal
discount
deliveryFee
total
deliveryType
deliveryName
deliveryPhone
deliveryAddress
estimatedDeliveryAt nullable
paymentStatus
notes
publicTrackingToken
createdAt
updatedAt

Delivery type:

DELIVERY
PICKUP

Payment status:

UNPAID
PAID
PARTIALLY_PAID
REFUNDED

Do NOT implement payment gateways yet.

Businesses can manually change payment status.

10. ORDER ITEMS
    OrderItem:

id
orderId
productId nullable
productNameSnapshot
unitPrice
quantity
subtotal

IMPORTANT:

Always store:

productNameSnapshot
unitPrice

inside the order item.

If the business changes a product later, historical orders must NOT change.

Example:

Product today:

Chocolate Cake
NPR 1800

Old order:

Chocolate Cake
NPR 1800

If the business later changes the product to NPR 2000, the old order must remain NPR 1800.

11. DELIVERY ADDRESS SNAPSHOT
    Do NOT rely only on the customer's current address.

The order must preserve the address used when the order was created.

Use:

deliveryName
deliveryPhone
deliveryAddress

inside the Order.

This protects historical order accuracy.

12. ORDER STATUS
    Use:

PENDING
CONFIRMED
PREPARING
READY
OUT_FOR_DELIVERY
DELIVERED
CANCELLED

Recommended valid workflow:

PENDING
↓
CONFIRMED
↓
PREPARING
↓
READY
↓
OUT_FOR_DELIVERY
↓
DELIVERED

Cancellation can occur before delivery.

Prevent nonsensical status transitions.

For example:

DELIVERED → PREPARING

should not be allowed by default.

13. ORDER STATUS HISTORY
    Create:

OrderStatusHistory

Fields:

id
orderId
oldStatus
newStatus
changedBy
note nullable
createdAt

Every status change must create a history record.

This powers the customer timeline and gives businesses basic accountability.

14. ORDER NUMBER
    Create human-readable order numbers.

Example:

ORD-1001
ORD-1002
ORD-1003

Order numbers should be unique within a business.

Do NOT use internal database IDs as public identifiers.

Do NOT expose:

/track/123

15. PUBLIC TRACKING TOKEN
    Every order receives a cryptographically secure random public token.

Example:

/track/8f3a91c7b2...

The token must:

Be unpredictable
Be sufficiently long
Be unique
Have a database unique constraint
Customers do not need an account to track an order.

The tracking page should expose only information appropriate for the customer.

16. CUSTOMER TRACKING PAGE
    Route:

/track/[token]

Mobile-first.

Example structure:

Business Logo

ABC Bakery

Order #ORD-1042

✓ Order Confirmed
✓ Preparing
● Ready
○ Out for Delivery
○ Delivered

Estimated delivery:
Today, 7:30 PM

---

2 × Chocolate Cake
NPR 1800

1 × Birthday Box
NPR 700

---

Total
NPR 2500

---

Need help?

Call Business

The page should include:

Business name
Logo
Order number
Order items
Quantities
Prices
Total
Current status
Status timeline
Estimated delivery if provided
Delivery/pickup information
Basic business contact information
Do NOT show:

Customer email
Internal notes
Staff information
Internal IDs
Private business information 17. BUSINESS DASHBOARD
Navigation:

Dashboard
Orders
Customers
Products
Settings

Dashboard should display:

Today's Orders
Pending
In Progress
Delivered

And recent orders.

Keep analytics intentionally basic.

Do not build advanced reporting.

18. ORDER CREATION
    Creating an order should be extremely fast.

Flow:

Create Order

Customer
[Search customer]
[+ New customer]

Products
[Add product]

Quantity

Delivery/Pickup

Delivery address

Discount

Delivery fee

Payment status

Estimated delivery

Notes

[Create Order]

After successful creation:

Order Created

ORD-1042

[View Order]

[Copy Tracking Link]

[Share Tracking Link]

Use the browser Web Share API when available.

The business can manually paste the tracking link into WhatsApp, Messenger, SMS, etc.

19. CUSTOMER MANAGEMENT
    Customer page:

Customers

[Search...]

Name
Phone
Orders
Last Order

Customer profile:

Name
Phone
Email
Address

Order History

ORD-1042
ORD-1031
ORD-1009

Do not build marketing automation.

20. PRODUCT MANAGEMENT
    Simple product management.

Fields:

Name
Description
Price
Active

Features:

Create
Edit
Activate/deactivate
Search
Do not build:

Inventory
Stock levels
Variants
Warehouses
Purchasing
Supplier management
Those are future features.

21. SHARING
    Provide:

Copy tracking link
Use clipboard API.

Share
Use Web Share API when supported.

Fallback:

Copy tracking link

Do NOT integrate WhatsApp API yet.

22. FUTURE NOTIFICATION ARCHITECTURE
    Although actual notifications are not part of MVP, structure the application so notifications can be added later.

Conceptually:

Order Status Changed
↓
Notification Service
↓
Provider Adapter
↓
WhatsApp / SMS / Email / Messenger

For MVP, the notification service can remain unimplemented.

Do not create fake integrations.

ORDER CREATION ATOMICITY

Creating an order and its order items must be performed inside a database transaction.

If any part of order creation fails, the entire operation must roll back.

The order must never exist without its required order items.

The tracking token must also be generated and stored as part of the successful transaction.

23. WHATSAPP
    Explicitly DO NOT implement:

WhatsApp Cloud API
Message templates
Webhooks
WhatsApp authentication
Automated WhatsApp notifications
WhatsApp chatbot
These belong to a later version.

The MVP only generates a tracking URL that the business can manually send through WhatsApp.

24. AI
    Explicitly DO NOT implement AI in MVP.

No:

AI chatbot
AI order parsing
AI recommendations
AI customer support
AI product search
AI can be added later after customer validation.

25. PAYMENTS
    Do not integrate:

eSewa
Khalti
Stripe
PayPal
Bank APIs
For MVP, payment status is manually controlled:

UNPAID
PAID
PARTIALLY_PAID
REFUNDED

Payment integration can be added later.

26. SECURITY
    Security is mandatory.

Implement:

Server-side authentication
Server-side authorization
Tenant isolation
Input validation
Secure sessions
HTTPS in production
Secure cookies where applicable
Environment variables for secrets
Database constraints
Proper foreign keys
Rate limiting for public tracking endpoint if practical
Safe error handling
No sensitive data in client responses
Never trust:

businessId
userId
role
customerId
orderId

provided by the browser without authorization checks.

27. DATA ACCESS LAYER
    Do not allow arbitrary Prisma queries throughout UI components.

Use a clear server-side data access/service layer.

Example:

server/
├── businesses/
├── customers/
├── products/
└── orders/

Example:

createOrder(...)
getOrder(...)
getOrders(...)
updateOrderStatus(...)

Each function must perform authorization before accessing tenant data.

The UI should never directly contain Prisma database logic.

28. VALIDATION
    Use Zod.

Create schemas such as:

createCustomerSchema
updateCustomerSchema
createProductSchema
createOrderSchema
updateOrderStatusSchema
businessSettingsSchema

Validate all important data server-side.

Examples:

Quantity must be positive
Price cannot be negative
Order must contain at least one item
Discount cannot create an invalid total
Delivery fee cannot be negative
Required customer fields must exist
Invalid status transitions must be rejected 29. ORDER CALCULATION
Do NOT trust totals calculated by the browser.

The server must calculate:

item subtotal

- delivery fee

* # discount
  total

The client may display calculated values for UX, but the server is authoritative.

Use appropriate decimal/money handling.

Avoid JavaScript floating-point errors when handling currency.

Store monetary values using an appropriate database numeric/decimal strategy.

30. DATABASE INDEXES
    Add indexes where they support actual queries.

At minimum consider:

Business.slug

BusinessMember.businessId
BusinessMember.userId

Customer.businessId
Customer.phone

Product.businessId
Product.active

Order.businessId
Order.customerId
Order.status
Order.createdAt
Order.publicTrackingToken

OrderItem.orderId

OrderStatusHistory.orderId
OrderStatusHistory.createdAt

Use compound indexes where useful, such as:

(businessId, createdAt)
(businessId, status)
(businessId, orderNumber)

Do not add indexes blindly.

31. FOLDER STRUCTURE
    Use:

src/
├── app/
│ ├── (auth)/
│ ├── (dashboard)/
│ ├── track/
│ │ └── [token]/
│ └── api/
│
├── components/
│ ├── ui/
│ └── shared/
│
├── features/
│ ├── orders/
│ ├── customers/
│ ├── products/
│ └── businesses/
│
├── server/
│ ├── auth/
│ ├── businesses/
│ ├── customers/
│ ├── products/
│ └── orders/
│
├── lib/
│ ├── db/
│ ├── validation/
│ ├── security/
│ └── utils/
│
└── types/

Also:

prisma/
docs/
public/

Keep server-only code clearly separated.

Use:

import "server-only";

where appropriate.

32. UI DESIGN
    The application should look like a legitimate commercial SaaS product.

Design principles:

Clean
Minimal
Professional
Fast
Mobile-first
Accessible
Easy for non-technical business owners
Avoid:

Excessive gradients
Excessive animations
Overly complicated dashboards
Excessive charts
Decorative UI that doesn't improve usability
Enterprise-style complexity
The most important screen is the order creation screen.

The second most important is the customer tracking page.

33. ERROR STATES
    Every important page should have useful states:

Loading
Empty
Success
Error
Unauthorized
Not found
Examples:

No orders:

No orders yet. Create your first order to start tracking customer deliveries.

Invalid tracking link:

This tracking link is invalid or no longer available.

Unauthorized:

You don't have permission to access this business.

Do not display raw database or server errors.

34. MOBILE RESPONSIVENESS
    Customers will primarily access tracking links on mobile.

Businesses may also manage orders from phones.

Therefore:

Tracking page must be excellent on mobile
Order status update must be easy on mobile
Dashboard must remain usable on mobile
Forms must be touch-friendly
Tables should become cards or horizontally scroll when appropriate
Test at common mobile widths.

35. TESTING
    Write automated tests for critical functionality.

Priority:

Tenant isolation
Test:

Business A cannot read Business B order
Business A cannot update Business B order
Business A cannot read Business B customer
Business A cannot read Business B product

Orders
Test:

Order creation
Item calculation
Discounts
Delivery fees
Total
Status transitions
Cancellation
Status history
Tracking
Test:

Valid token
Invalid token
Correct business/order
No private data leakage
Authentication
Test:

Unauthenticated access
Authenticated access
Business membership
Owner/staff permissions
E2E
Use Playwright for the most important complete flow:

Register
→ Create business
→ Add product
→ Add customer
→ Create order
→ Copy tracking URL
→ Open tracking URL
→ Update status
→ Verify customer sees new status

36. SEED DATA
    Provide realistic seed data.

Business:

Kathmandu Bakery

Products:

Chocolate Cake — NPR 1800
Red Velvet Cake — NPR 2200
Birthday Box — NPR 700

Customers:

Ram Sharma
Sita Thapa
Hari Gurung

Create orders with multiple statuses.

The development environment should immediately look populated.

37. DEVELOPMENT ENVIRONMENT
    The application must be easy for inexperienced developers to run.

README must explain:

Prerequisites
Installation
Environment variables
Database setup
Migration
Seed
Development server
Testing
Build
Deployment

Provide:

.env.example

Never commit real secrets.

38. DOCUMENTATION
    Create:

docs/
├── architecture.md
├── database.md
├── security.md
├── deployment.md
├── development.md
└── roadmap.md

Documentation should explain the architecture in language that junior developers can understand.

39. DEPLOYMENT
    Target a simple deployment architecture:

Browser
↓
Next.js application
↓
Managed PostgreSQL

Do not introduce:

Docker orchestration
Kubernetes
Microservices
Message queues
Redis
Kafka
GraphQL
Elasticsearch
unless a real requirement appears later.

The MVP should remain inexpensive and easy to operate.

40. OBSERVABILITY
    For MVP, keep this simple.

Provide:

Server error logging
Basic application logs
Database backups through the chosen provider
Basic uptime/error monitoring where practical
Do not build an elaborate observability stack.

41. FUTURE ARCHITECTURE
    The MVP should be able to evolve toward:

                        SaaS
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Orders       CRM       Products
              │
              ▼

    Notification Layer
    │
    ┌─────┼─────┐
    ▼ ▼ ▼
    WhatsApp SMS Email
    │
    ▼
    AI Layer

Future features may include:

WhatsApp Cloud API
Messenger
Instagram
AI ordering
Automated notifications
Inventory
Payments
Delivery management
Advanced CRM
Analytics
Subscription billing
White-label SaaS
Do not implement them now.

42. COST CONTROL
    This is a startup MVP.

Optimize for:

Low development cost
Low infrastructure cost
Low maintenance cost
Fast iteration

Prefer:

Managed services
Free/open-source libraries
Free/low-cost tiers during development
One codebase
One database
Minimal third-party dependencies
But never compromise security merely to remain free.

The goal is not:

"Build everything for free."

The goal is:

"Spend as little as possible until the product proves demand."

43. NO OVERENGINEERING RULE
    Before implementing any feature, ask:

Is it necessary for the core order-tracking workflow?
Will a real business need it during MVP testing?
Can it be implemented simply?
Will it create significant maintenance cost?
Can it safely be postponed?
If it is not necessary, postpone it.

Do not invent additional features.

44. DEVELOPMENT METHOD
    Do NOT generate the entire application at once.

Work in milestones.

Milestone 1
Project setup:

Next.js App Router
TypeScript
Tailwind
Database
Prisma
Authentication
Basic layout
Milestone 2
Business onboarding:

Business creation
Business settings
Membership
Milestone 3
Customers:

CRUD
Search
Customer details
Milestone 4
Products:

CRUD
Active/inactive
Milestone 5
Orders:

Create
View
Edit
Calculate totals
Payment status
Delivery information
Milestone 6
Order workflow:

Status changes
Status history
Milestone 7
Customer tracking:

Secure tracking token
Public tracking page
Timeline
Copy/share
Milestone 8
Dashboard:

Order counts
Recent orders
Search/filter
Milestone 9
Security/testing:

Tenant isolation
Validation
Error handling
E2E tests
Mobile testing
Milestone 10
Deployment:

Production database
Production environment
Domain
Backups
Monitoring
After every milestone:

Run tests.
Run type checking.
Run linting.
Verify production build.
Check database migrations.
Manually test the main workflow.
Fix errors before proceeding. 45. REQUIRED PRE-CODING RESPONSE
Before writing application code, provide:

A. Final architecture
Explain:

Browser
↓
Next.js
↓
Server Actions / Services
↓
Auth
↓
Authorization
↓
Prisma
↓
PostgreSQL

B. Final database schema
Show all tables and relationships.

C. Final folder structure
Show the proposed project tree.

D. Authentication decision
Choose ONE authentication solution and explain why.

E. Security model
Explain exactly how tenant isolation will work.

F. MVP feature list
Separate:

BUILD NOW

from:

DO NOT BUILD

G. Development milestones
Explain what will be implemented in each milestone.

H. Risks
Identify architectural or implementation risks.

Then STOP.

Wait for approval before generating the first implementation.

46. IMPORTANT FINAL RULE
    You are building a small commercial MVP, not an enterprise platform.

The correct result is:

Small
Fast
Secure
Simple
Useful
Maintainable
Cheap
Expandable

The incorrect result is:

Huge
Complex
Expensive
Over-engineered
Difficult to maintain

The first version should be good enough that a small Nepali business can register, create an order, send the customer a tracking link, update the order, and have the customer understand exactly what is happening.

Build that extremely well.

Everything else can come later.
