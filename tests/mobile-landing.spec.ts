import { expect, test } from "@playwright/test";

test("landing page is usable at 375px without overflow, runtime errors, or failed resources", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedResources: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedResources.push(`${request.method()} ${request.url()}`),
  );

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("header")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(page.locator("#pricing")).toBeVisible();
  await expect(page.getByText("Why people switch to ShieldMail.")).toBeVisible();
  await expect(page.getByText("From exposed to invisible in 60 seconds.")).toBeVisible();
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "Pricing" }).last()).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();

  expect(consoleErrors).toEqual([]);
  expect(failedResources).toEqual([]);
});

test("landing page preserves desktop navigation at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Open navigation" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Features" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
});
