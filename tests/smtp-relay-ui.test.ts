import assert from "node:assert/strict";
import test from "node:test";
import {
  canAssignCustomRelay,
  relayCheckRows,
  relayPageState,
  smtpRelayStatusLabel,
  smtpRelayStatuses,
} from "../src/lib/smtp-relay-ui.ts";

test("relay UI covers every backend relay state with an explicit label", () => {
  assert.deepEqual(Object.keys(smtpRelayStatusLabel), smtpRelayStatuses);
  assert.equal(smtpRelayStatusLabel.credentials_unverified, "credentials untested");
  assert.equal(smtpRelayStatusLabel.circuit_open, "circuit open");
});

test("relay page fails closed while the feature is disabled", () => {
  assert.equal(
    relayPageState({ loading: false, enabled: false, error: false, relayCount: 0 }),
    "disabled",
  );
  assert.equal(
    relayPageState({ loading: false, enabled: true, error: true, relayCount: 0 }),
    "error",
  );
  assert.equal(
    relayPageState({ loading: false, enabled: true, error: false, relayCount: 0 }),
    "empty",
  );
});

test("custom alias routing requires a ready relay with a closed circuit", () => {
  assert.equal(canAssignCustomRelay("ready", "closed"), true);
  assert.equal(canAssignCustomRelay("active", "closed"), true);
  assert.equal(canAssignCustomRelay("degraded", "closed"), false);
  assert.equal(canAssignCustomRelay("active", "open"), false);
});

test("test checks never claim delivery before a recipient confirms it", () => {
  const submitted = relayCheckRows("awaiting_recipient_confirmation", "smtp_submitted");
  assert.equal(submitted[3]?.state, "running");
  assert.equal(submitted[3]?.code, "smtp_submitted");
  const failed = relayCheckRows("degraded", "relay_dns_not_ready");
  assert.equal(
    failed.every((check) => check.state === "failed"),
    true,
  );
});
