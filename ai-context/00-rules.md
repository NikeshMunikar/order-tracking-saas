# AI Rules

## Authority
1. `MASTER_SPEC.md` — immutable product authority.
2. Accepted ADRs in `docs/architecture-decisions.md` — significant technical decisions.
3. `docs/*` — authoritative derived engineering guidance.
4. `ai-context/*` — compressed derivative context.
5. `CURRENT_STATE.md` — reality record; never planned architecture.

Before coding, read the master spec, current state, relevant authoritative docs, and `DO_NOT_BUILD.md`; inspect the repository.

## Non-negotiables
- Authorization has two separate domains: platform/company roles are exactly `SUPER_ADMIN` and `ADMIN`; customer-business roles are exactly `OWNER` and `STAFF`. Never conflate them.
- `BusinessMember.role` is exactly `OWNER | STAFF`; no platform role may be stored there and no generic permission engine or role hierarchy may be introduced.
- Browser input is untrusted. Authorization, tenant isolation, ownership, and financial correctness are server-side.
- Public tracking is a separate unauthenticated boundary with secure tokens and an allow-listed DTO.
- Keep Prisma/database access behind server-only services.
- Exactly one approved authentication provider; no custom password/auth infrastructure.
- Do not invent requirements.
- Do not invent roles.
- Do not invent permissions.
- Do not invent platform capabilities.
- Do not invent financial semantics, status transitions, APIs, infrastructure, or compliance commitments.
- Resolve material open decisions through ADRs; do not silently guess.
- Add critical negative security tests and verify changes.
- Never claim implementation or passing tests without evidence.
- Platform-role capabilities are intentionally open; do not invent platform permissions, dashboards, APIs, or workflows.
- Platform authority must be enforced server-side and cannot bypass tenant authorization.
