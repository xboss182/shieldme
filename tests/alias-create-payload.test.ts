import assert from "node:assert/strict";
import test from "node:test";
import { createAliasPayload } from "../src/lib/alias-create-payload.ts";

const baseInput = {
  serviceLabel: "Netflix",
  localPart: "netflix-a1b2c3d4e5",
  domainId: "a0000000-0000-0000-0000-000000000001",
  recipientId: "b0000000-0000-0000-0000-000000000002",
  pgpMode: "none" as const,
};

test("generated alias submission omits the preview localPart", () => {
  const payload = createAliasPayload({ ...baseInput, localPartEdited: false });

  assert.deepEqual(payload, { ...baseInput, localPart: undefined });
  assert.equal("localPart" in JSON.parse(JSON.stringify(payload)), false);
});

test("manual alias submission preserves an explicitly edited localPart", () => {
  const payload = createAliasPayload({
    ...baseInput,
    localPart: "My-Netflix",
    localPartEdited: true,
  });

  assert.deepEqual(payload, { ...baseInput, localPart: "My-Netflix" });
});
