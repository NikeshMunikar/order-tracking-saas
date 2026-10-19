"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/client";
import { readClientIdentityFromHeaders } from "@/lib/security/client-identity";
import {
  buildRateLimitKey,
  createRateLimiter,
  INVITATION_FAILURE_RATE_LIMIT,
  RATE_LIMIT_BOUNDARY_INVITATION,
  RATE_LIMITED_ACTION_MESSAGE,
} from "@/lib/security/rate-limit";
import {
  createBusinessSchema,
  inviteMemberSchema,
  updateBusinessSettingsSchema,
  updateMemberRoleSchema,
} from "@/lib/validation/business";
import {
  createBusiness,
  removeMember,
  updateBusinessSettings,
  updateMemberRole,
} from "@/server/business/business-service";
import { toSafeActionMessage } from "@/server/business/action-errors";
import {
  acceptInvitation,
  inviteMember,
  revokeInvitation,
} from "@/server/business/invitation-service";
import { requireSession } from "@/server/auth/session";
import type {
  AcceptInvitationActionState,
  CreateBusinessActionState,
  FormActionState,
  InviteMemberActionState,
} from "@/server/business/action-states";

// Server Actions for the M2 business/onboarding/membership/invitation UI.
//
// Every action below:
//   1. establishes the authenticated identity server-side (requireSession),
//   2. treats every browser-supplied value (including businessId, memberId,
//      invitationId and role) as untrusted input,
//   3. delegates tenant authorization to the domain services, which
//      re-derive the caller's membership/role from the database inside the
//      mutation transaction (never from the request), and
//   4. maps errors to safe messages via toSafeActionMessage (no Prisma/SQL
//      detail ever reaches the browser).
//
// Actions return structured results instead of calling redirect(), so the
// caller can render success/error/empty states predictably.

// Interim in-process fixed-window failure limiter for invitation acceptance
// (DEC-015): process-local, per instance, reset on restart; NOT shared
// across instances and not production-grade (the M10 host design must
// provide shared abuse protection). Only FAILED acceptance attempts
// (generic-invalid outcomes and service errors) consume budget — a success
// never does, so unrelated users behind the same client identity are not
// locked out by someone else's activity. It runs after the existing
// authentication gate and never substitutes for it.
const invitationFailureLimiter = createRateLimiter(INVITATION_FAILURE_RATE_LIMIT);

async function invitationRateLimitKey(): Promise<string> {
  const clientIdentity = readClientIdentityFromHeaders(await headers());
  return buildRateLimitKey(RATE_LIMIT_BOUNDARY_INVITATION, clientIdentity);
}

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBusinessFields(formData: FormData) {
  return {
    name: formData.get("name"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    logoUrl: formData.get("logoUrl"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    description: formData.get("description"),
  };
}

export async function createBusinessAction(
  _prevState: CreateBusinessActionState,
  formData: FormData,
): Promise<CreateBusinessActionState> {
  const session = await requireSession();

  const parsed = createBusinessSchema.safeParse(readBusinessFields(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const business = await createBusiness(session.user.id, parsed.data);
    revalidatePath("/dashboard");
    return { status: "success", businessId: business.id };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function updateBusinessSettingsAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  if (!businessId) {
    return { status: "error", message: "Missing business." };
  }

  const parsed = updateBusinessSettingsSchema.safeParse(readBusinessFields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    await updateBusinessSettings(session.user.id, businessId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/settings`);
    revalidatePath(`/dashboard/${businessId}`);
    revalidatePath("/dashboard");
    return { status: "success", message: "Settings saved." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function updateMemberRoleAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const memberId = readRequiredString(formData, "memberId");
  if (!businessId || !memberId) {
    return { status: "error", message: "Missing team member." };
  }

  const parsed = updateMemberRoleSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) {
    return { status: "error", message: "Choose a valid role." };
  }

  try {
    await updateMemberRole(session.user.id, businessId, memberId, parsed.data.role);
    revalidatePath(`/dashboard/${businessId}/team`);
    return { status: "success", message: "Role updated." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function removeMemberAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const memberId = readRequiredString(formData, "memberId");
  if (!businessId || !memberId) {
    return { status: "error", message: "Missing team member." };
  }

  try {
    await removeMember(session.user.id, businessId, memberId);
    revalidatePath(`/dashboard/${businessId}/team`);
    return { status: "success", message: "Team member removed." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function inviteMemberAction(
  _prevState: InviteMemberActionState,
  formData: FormData,
): Promise<InviteMemberActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  if (!businessId) {
    return { status: "error", message: "Missing business." };
  }

  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const invitation = await inviteMember(session.user.id, businessId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/team`);
    return {
      status: "success",
      invitedEmail: parsed.data.email,
      inviteToken: invitation.rawToken,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function revokeInvitationAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const invitationId = readRequiredString(formData, "invitationId");
  if (!businessId || !invitationId) {
    return { status: "error", message: "Missing invitation." };
  }

  try {
    await revokeInvitation(session.user.id, businessId, invitationId);
    revalidatePath(`/dashboard/${businessId}/team`);
    return { status: "success", message: "Invitation revoked." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function acceptInvitationAction(
  _prevState: AcceptInvitationActionState,
  formData: FormData,
): Promise<AcceptInvitationActionState> {
  const session = await requireSession();

  const rateLimitKey = await invitationRateLimitKey();

  // Interim abuse protection (DEC-015): a client already over its failure
  // budget is throttled before any token work happens. The existing
  // authentication, email-binding and token validation remain the
  // authoritative gates — the limiter adds nothing beyond throttling.
  if (invitationFailureLimiter.isBlocked(rateLimitKey)) {
    return { status: "error", message: RATE_LIMITED_ACTION_MESSAGE };
  }

  const rawToken = readRequiredString(formData, "token");
  if (!rawToken) {
    return { status: "invalid" };
  }

  // The invitation is bound to the accepting account's email. That email is
  // read fresh from the database for the authenticated user id — never from
  // the JWT claim (which may be stale) and never from the browser.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });

  if (!user) {
    return { status: "invalid" };
  }

  try {
    const result = await acceptInvitation(session.user.id, user.email, rawToken);

    if (result.outcome === "invalid") {
      // accepted / revoked / expired / nonexistent / email-mismatch are all
      // collapsed to one generic outcome (no enrollment-state enumeration).
      invitationFailureLimiter.consume(rateLimitKey);
      return { status: "invalid" };
    }

    revalidatePath("/dashboard");
    return { status: "success", businessId: result.businessId };
  } catch (error) {
    const message = toSafeActionMessage(error);

    // A zero-row claim returns "invalid"; a thrown error means something
    // else happened (e.g. the account is already a member of this
    // business). Reaching this point requires a valid token whose email
    // matches the caller, so surfacing a generic safe message here does not
    // leak invitation state to anyone else.
    invitationFailureLimiter.consume(rateLimitKey);
    return { status: "error", message };
  }
}
