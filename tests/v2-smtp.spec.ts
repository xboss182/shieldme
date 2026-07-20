import { expect, test, type Page } from "@playwright/test";

const now = new Date().toISOString();
const relay = {
  id: "relay-1",
  domainId: "domain-1",
  label: "Provider production",
  host: "smtp.provider.test",
  port: 587,
  tlsMode: "starttls",
  authMethod: "plain",
  identityLocalPart: "forward",
  bounceSpfInclude: "include:provider.test",
  credentialConfigured: true,
  status: "ready",
  circuitStatus: "closed",
  circuitUntil: null,
  lastOutcomeCode: "recipient_confirmed",
  lastTestedAt: now,
  activeCredentialVersion: 1,
  queue: { queued: 0, retryDeadline: null },
  createdAt: now,
  updatedAt: now,
};

async function mockV2Api(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response =
      path === "/api/smtp-relays"
        ? { relays: [relay] }
        : path === "/api/domains"
          ? {
              domains: [
                {
                  id: "domain-1",
                  domain: "example.test",
                  status: "verified",
                  isActive: true,
                  dkimSelector: "sm1",
                  createdAt: now,
                },
              ],
            }
          : path === "/api/recipients"
            ? {
                recipients: [
                  {
                    id: "recipient-1",
                    email: "verified@example.test",
                    status: "verified",
                    isActive: true,
                    createdAt: now,
                  },
                ],
              }
            : path === "/api/aliases"
              ? {
                  aliases: [
                    {
                      id: "alias-1",
                      localPart: "shop",
                      domainId: "domain-1",
                      domain: { domain: "example.test" },
                      recipientId: "recipient-1",
                      recipient: { email: "verified@example.test" },
                      status: "active",
                      outboundMode: "platform",
                      createdAt: now,
                      updatedAt: now,
                    },
                  ],
                }
              : path === "/api/smtp-relays/relay-1/audit-events"
                ? { events: [] }
                : { error: "Unexpected API request" };
    await route.fulfill({
      status: "error" in response ? 404 : 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

test("V2 relay flow is usable at 375px without unintended SMTP calls", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sm_access", "test-token"));
  await mockV2Api(page);
  await page.goto("/v2", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Bring your own SMTP, safely" })).toBeVisible();
  await expect(page.getByText("platform fallback is off", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign fail-closed relay" })).toBeDisabled();
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
});

test("V2 exposes relay status and assignment acknowledgement on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("sm_access", "test-token"));
  await mockV2Api(page);
  await page.goto("/v2", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Provider production" })).toBeVisible();
  await expect(page.getByText("recipient_confirmed")).toBeVisible();
  await expect(page.getByText("I understand the consequences.")).toBeVisible();
  await expect(page.getByText("Audit history")).toBeVisible();
});
