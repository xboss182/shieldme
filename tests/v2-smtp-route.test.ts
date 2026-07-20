import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/routes/v2.tsx", import.meta.url), "utf8");
const dashboard = await readFile(
  new URL("../src/components/v2-relay-dashboard.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("V2 is authenticated and upgrades remains an intentional redirect", async () => {
  const upgrades = await readFile(new URL("../src/routes/upgrades.tsx", import.meta.url), "utf8");
  assert.match(route, /createFileRoute\("\/v2"\)/);
  assert.match(route, /tokenStore\.getAccess/);
  assert.match(upgrades, /redirect\(\{ to: "\/v2", replace: true \}\)/);
});

test("V2 uses server-constrained recipients and never reuses SMTP secrets", () => {
  assert.match(dashboard, /Select your verified recipient/);
  assert.match(dashboard, /server validates recipient ownership/);
  assert.match(dashboard, /write-only/);
  assert.match(dashboard, /never displayed, copied, or returned/);
  assert.doesNotMatch(dashboard, /navigator\.clipboard/);
});

test("V2 makes confirmation and fail-closed consequences explicit", () => {
  assert.match(dashboard, /SMTP submitted a test message\. Delivery is not confirmed/);
  assert.match(dashboard, /platform fallback is off/);
  assert.match(dashboard, /Assign fail-closed relay/);
  assert.match(dashboard, /Disable kill switch/);
  assert.match(styles, /prefers-reduced-motion/);
});
