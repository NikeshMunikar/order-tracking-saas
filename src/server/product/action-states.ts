// Client-visible Server Action result shapes for the product UI.
//
// These live in a plain module (not a "use server" file) because a "use
// server" module may only export async functions. Same convention as
// src/server/customer/action-states.ts.

export type CreateProductActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; productId: string };

export type ProductMutationActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };
