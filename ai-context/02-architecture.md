# Architecture Context

- Modular monolith: Next.js App Router + React + TypeScript + Tailwind + PostgreSQL + Prisma + Zod.
- Flow: browser → Next.js → authentication → membership/role authorization → validation → tenant-scoped service/data layer → Prisma → PostgreSQL.
- Platform/company authorization domain: exactly `SUPER_ADMIN`, `ADMIN`. Customer-business domain: exactly `OWNER`, `STAFF`. No generic permission engine or role hierarchy.
- `BusinessMember.role` is exactly `OWNER | STAFF`; platform roles are separate concepts/boundaries.
- Platform administration, when eventually implemented, uses its own server-side authorization boundary and never bypasses tenant isolation.
- Pooled multi-tenancy; business context is server-derived/verified from membership.
- Public tracking `/track/[token]` is a distinct unauthenticated boundary.
- Server Actions for in-app mutations where appropriate; Route Handlers only for actual HTTP endpoints.
- Scale through module boundaries, efficient query shapes, pagination, indexes, selective projection, transactions, safe concurrency, and measurement.
- No microservices, Redis, Kafka, GraphQL, Elasticsearch, Kubernetes, or distributed event systems for MVP.
