import { expect, test } from "@playwright/test";
import { buildForwardBanner } from "../backend/alias-forwarder/src/lib/forward-banner.js";

function renderBanner(matchedAlias: string) {
  return buildForwardBanner({
    matchedAlias,
    dashboardUrl: "https://app.shieldme.cc/aliases",
    trackingProtection: {
      enabled: true,
      pixelsRemoved: 2,
      linksRewritten: 1,
    },
  });
}

function pageHtml(banner: string) {
  return `<main style="box-sizing:border-box;width:100%;padding:8px;">${banner}</main>`;
}

test("forward banner stays on one compact line at normal desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 240 });
  await page.setContent(pageHtml(renderBanner("netflix-2sdf7@shieldme.cc")));

  const flow = page.locator("td > div");
  const box = await flow.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThan(40);
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "href",
    "https://app.shieldme.cc/aliases",
  );
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
  await page.screenshot({ path: "test-results/forward-banner-desktop.png" });
});

test("forward banner wraps a long alias at 320px without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.setContent(
    pageHtml(renderBanner("a-very-long-generated-alias-that-must-wrap-safely-2sdf7@shieldme.cc")),
  );

  const flow = page.locator("td > div");
  const box = await flow.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThan(40);
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
  await expect(
    page.locator("table").evaluate((table) => table.scrollWidth <= table.clientWidth),
  ).resolves.toBe(true);
  await page.screenshot({ path: "test-results/forward-banner-mobile-320.png" });
});
