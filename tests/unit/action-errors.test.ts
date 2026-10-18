import assert from "node:assert/strict";
import { test } from "node:test";

import { toSafeActionMessage } from "../../src/server/business/action-errors.ts";
import {
  BusinessAuthorizationError,
  BusinessMemberAlreadyExistsError,
  BusinessMemberNotFoundError,
  BusinessNotFoundError,
  InvitationNotFoundError,
  LastOwnerError,
} from "../../src/server/business/errors.ts";

// Only messages authored in action-errors.ts may reach the browser. Anything
// else — Prisma errors, SQL text, a Postgres deadlock/serialization failure —
// must collapse to a single generic message.

test("maps every known domain error to its own safe message", () => {
  assert.equal(
    toSafeActionMessage(new BusinessNotFoundError()),
    "You don't have access to this business.",
  );
  assert.equal(
    toSafeActionMessage(new BusinessAuthorizationError()),
    "You don't have permission to perform this action.",
  );
  assert.equal(
    toSafeActionMessage(new BusinessMemberNotFoundError()),
    "That team member could not be found.",
  );
  assert.equal(
    toSafeActionMessage(new LastOwnerError()),
    "A business must always have at least one owner.",
  );
  assert.equal(
    toSafeActionMessage(new InvitationNotFoundError()),
    "That invitation is no longer available.",
  );
  assert.equal(
    toSafeActionMessage(new BusinessMemberAlreadyExistsError()),
    "That person is already a member of this business.",
  );
});

test("maps unknown, Prisma, and concurrency errors to the generic message", () => {
  const generic = "Something went wrong. Please try again.";

  const cases: unknown[] = [
    new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    Object.assign(new Error("Unique constraint failed on the fields: (`tokenHash`)"), {
      code: "P2002",
      meta: { target: ["tokenHash"] },
    }),
    Object.assign(new Error("deadlock detected"), { code: "40P01" }),
    Object.assign(new Error("could not serialize access due to concurrent update"), {
      code: "40001",
    }),
    { code: "P2002" },
    "raw string error",
    null,
    undefined,
  ];

  for (const error of cases) {
    assert.equal(toSafeActionMessage(error), generic);
  }
});

test("the generic message leaks no internal error text", () => {
  const error = new Error(
    "Invalid `prisma.customer.findMany()` invocation: SELECT id, email FROM customers WHERE deletedAt IS NULL",
  );

  const message = toSafeActionMessage(error);

  assert.equal(message, "Something went wrong. Please try again.");
  for (const fragment of ["prisma", "SELECT", "customers", "deletedAt", "invocation"]) {
    assert.ok(!message.includes(fragment), `generic message must not contain "${fragment}"`);
  }
});
