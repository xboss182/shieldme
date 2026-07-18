import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adminApi } from "../src/lib/api.ts";

const adminRoute = await readFile(new URL("../src/routes/_app.admin.tsx", import.meta.url), "utf8");

test("reserved admin API sends search, page, and bounded page size", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({ reservedLocalParts: [], page: 3, limit: 50, total: 1212 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await adminApi.reservedLocalParts("pay.skrill", 3, 50);
    assert.equal(result.total, 1212);
    assert.match(requestedUrl, /search=pay\.skrill/);
    assert.match(requestedUrl, /page=3/);
    assert.match(requestedUrl, /limit=50/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Admin Reserved renders count and pagination without all-at-once rows", () => {
  assert.match(adminRoute, /const pageSize = 50/);
  assert.match(adminRoute, /reserved rules/);
  assert.match(adminRoute, /Page \{page\} of \{totalPages\}/);
  assert.match(adminRoute, />\s*Previous\s*</);
  assert.match(adminRoute, />\s*Next\s*</);
  assert.match(adminRoute, /adminApi\.reservedLocalParts\(search, page, pageSize, secret\)/);
});
