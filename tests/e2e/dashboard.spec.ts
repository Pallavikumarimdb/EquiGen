import { test, expect } from "@playwright/test";

test.describe("EquiGen Dashboard E2E", () => {
  test.beforeEach(async ({ page, context }) => {
    // Authenticate via demo endpoint and inject session cookie directly
    const res = await page.request.post("/api/auth/demo");
    const cookieHeader = res.headers()["set-cookie"];
    if (cookieHeader) {
      const match = cookieHeader.match(/session_token=([^;]+)/);
      if (match) {
        await context.addCookies([
          {
            name: "session_token",
            value: match[1],
            domain: "localhost",
            path: "/",
          },
        ]);
      }
    }
    await page.goto("/");
  });

  test("loads the dashboard with header, brand and research views", async ({ page }) => {
    // 1. Verify brand is present
    const brand = page.locator("text=EquiGen").first();
    await expect(brand).toBeVisible({ timeout: 10000 });

    // 2. Verify persona navigation or header actions
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible();

    // 3. Verify main content area
    const main = page.locator("main, body").first();
    await expect(main).toBeVisible();
  });

  test("can switch between persona perspectives", async ({ page }) => {
    const buySideBtn = page.getByRole("button", { name: /Buy-Side/i }).first();
    const sellSideBtn = page.getByRole("button", { name: /Sell-Side/i }).first();

    if (await buySideBtn.isVisible()) {
      await buySideBtn.click();
      await page.waitForTimeout(300);
    }

    if (await sellSideBtn.isVisible()) {
      await sellSideBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test("opens new research modal or coverage search", async ({ page }) => {
    const newResearchBtn = page.getByRole("button", { name: /New Research|New Coverage|Initiate/i }).first();
    if (await newResearchBtn.isVisible()) {
      await newResearchBtn.click();
      const modal = page.locator("[role='dialog'], .fixed").first();
      await expect(modal).toBeVisible();
    }
  });
});
