import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

test("login form submit handler prevents duplicate submission while loading", () => {
  const fileContent = readFileSync("src/routes/_auth.login.tsx", "utf8");
  assert.match(fileContent, /disabled=\{loading\}/, "Submit button must be disabled when loading");
  assert.match(fileContent, /if\s*\(loading\)\s*return/, "Submit handler must guard against re-entry while loading");
});
