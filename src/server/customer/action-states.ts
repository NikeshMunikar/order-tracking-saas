// Client-visible Server Action result shapes for the customer UI.
//
// These live in a plain module (not a "use server" file) because a "use
// server" module may only export async functions. Same convention as
// src/server/business/action-states.ts.

export type CreateCustomerActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; customerId: string };

export type CustomerMutationActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };
