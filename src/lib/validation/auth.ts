import { z } from "zod";

// Server-side validation boundary for authentication inputs (MASTER_SPEC.md
// "browser input is untrusted" — validation happens here, not just in the
// browser form).

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long")
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password is too long"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(200, "Password is too long"),
});

export type LoginInput = z.infer<typeof loginSchema>;
