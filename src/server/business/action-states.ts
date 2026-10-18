// Client-visible result shapes for the M2 business Server Actions.
//
// These types are deliberately separated from `actions.ts` (which carries
// "use server"): a "use server" module is only guaranteed to accept async
// function exports, so the shared `useActionState` state types live here,
// where both the server actions and the client form components can import
// them without pulling any server-only code into the browser bundle.

export type FormActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export type CreateBusinessActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; businessId: string };

export type InviteMemberActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      invitedEmail: string;
      /** Raw invitation token — shown to the OWNER once so they can relay the link; never persisted or logged. */
      inviteToken: string;
      expiresAt: string;
    };

export type AcceptInvitationActionState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "success"; businessId: string }
  | { status: "error"; message: string };
