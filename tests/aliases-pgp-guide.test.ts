import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const aliasesRoute = await readFile(
  new URL("../src/routes/_app.aliases.tsx", import.meta.url),
  "utf8",
);
const guideStart = aliasesRoute.indexOf("<details");
const guideEnd = aliasesRoute.indexOf("</details>", guideStart);
const guide = aliasesRoute.slice(guideStart, guideEnd);

test("PGP Gmail Guide is a collapsed native disclosure", () => {
  assert.notEqual(guideStart, -1);
  assert.notEqual(guideEnd, -1);
  assert.match(guide, /<summary[\s>]/);
  assert.doesNotMatch(guide.match(/<details[^>]*>/)?.[0] ?? "", /\sopen(?:\s|=|>)/);
  assert.match(guide, />PGP Gmail Guide</);
  assert.match(guide, /<ChevronDown/);
  assert.match(guide, /aria-hidden="true"/);
});

test("PGP Gmail Guide preserves its instructions", () => {
  assert.match(guide, /PGP-encrypted mailbox delivery is available on every plan/);
  assert.match(guide, /Create your key/);
  assert.match(guide, /Add the public key/);
  assert.match(guide, /Turn it on per alias/);
});
