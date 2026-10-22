import assert from "node:assert/strict";
import { test } from "node:test";

import {
  closeMenuOnEscape,
  shouldCloseMenuOnPathnameChange,
} from "../../src/components/layout/business-navigation-utils.ts";

test("Escape closes the menu and returns focus to the trigger", () => {
  const calls: string[] = [];

  const handled = closeMenuOnEscape(
    "Escape",
    () => calls.push("close"),
    () => calls.push("focus"),
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["close", "focus"]);
});

test("other keys leave the menu and focus unchanged", () => {
  let closed = false;
  let focused = false;

  for (const key of ["Enter", "Tab", " ", "Esc"]) {
    assert.equal(
      closeMenuOnEscape(
        key,
        () => {
          closed = true;
        },
        () => {
          focused = true;
        },
      ),
      false,
    );
  }

  assert.equal(closed, false);
  assert.equal(focused, false);
});

test("pathname changes close the mobile menu, including back/forward", () => {
  assert.equal(
    shouldCloseMenuOnPathnameChange(
      "/dashboard/business-1",
      "/dashboard/business-1/orders",
    ),
    true,
  );
  assert.equal(
    shouldCloseMenuOnPathnameChange(
      "/dashboard/business-1/orders",
      "/dashboard/business-1",
    ),
    true,
  );
  assert.equal(
    shouldCloseMenuOnPathnameChange(
      "/dashboard/business-1/orders",
      "/dashboard/business-1/orders",
    ),
    false,
  );
});
