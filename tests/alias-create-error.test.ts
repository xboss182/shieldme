import assert from "node:assert/strict";
import test from "node:test";
import { aliasCreationErrorMessage as dashboardMessage } from "../src/lib/alias-create-error.ts";
import { aliasCreationErrorMessage as extensionMessage } from "../extension/lib/alias-create-error.ts";

test("dashboard presents stable reserved guidance", () => {
  assert.equal(
    dashboardMessage(Object.assign(new Error("backend wording"), { code: "RESERVED_ALIAS" })),
    "That alias name is reserved. Please choose or regenerate a different name.",
  );
});

test("extension presents stable reserved guidance", () => {
  assert.equal(
    extensionMessage(Object.assign(new Error("backend wording"), { code: "RESERVED_ALIAS" })),
    "That alias name is reserved. Regenerate or edit the alias name and try again.",
  );
});

test("both clients add actionable guidance to uniqueness conflicts", () => {
  assert.match(
    dashboardMessage(new Error("Alias already exists")),
    /choose or regenerate a different alias name/i,
  );
  assert.match(
    extensionMessage(new Error("Alias already exists")),
    /regenerate or edit the alias name/i,
  );
});
