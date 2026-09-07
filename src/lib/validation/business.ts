import { z } from "zod";

// Server-side validation boundary for M2 business/membership/invitation
// inputs (MASTER_SPEC.md — browser input is untrusted). Mirrors the
// conventions already established in src/lib/validation/auth.ts, including
// reusing the exact same email normalization (`trim().toLowerCase()`)
// rather than introducing a second, conflicting scheme.

function optionalTrimmedString(maxLength: number, message: string) {
  return z
    .string()
    .trim()
    .max(maxLength, message)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value));
}

export const businessMemberRoleSchema = z.enum(["OWNER", "STAFF"]);
export type BusinessMemberRoleInput = z.infer<typeof businessMemberRoleSchema>;

const businessFieldsSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(120, "Business name is too long"),
  currency: z.string().trim().min(1, "Currency is required").max(10, "Currency code is too long"),
  timezone: z.string().trim().min(1, "Timezone is required").max(100, "Timezone is too long"),
  logoUrl: optionalTrimmedString(2048, "Logo URL is too long"),
  phone: optionalTrimmedString(30, "Phone number is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .email("Enter a valid email address")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  address: optionalTrimmedString(500, "Address is too long"),
  description: optionalTrimmedString(2000, "Description is too long"),
});

/** Business creation input. Slug is server-generated, never client-supplied. */
export const createBusinessSchema = businessFieldsSchema;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

/**
 * Business settings update input. Same field shape as creation — `slug` is
 * intentionally not included: the approved M2 spec only defines slug
 * generation/collision handling at creation time, not slug editing, so
 * slug remains immutable in M2 rather than inventing new behavior.
 */
export const updateBusinessSettingsSchema = businessFieldsSchema;
export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address"),
  role: businessMemberRoleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: businessMemberRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
