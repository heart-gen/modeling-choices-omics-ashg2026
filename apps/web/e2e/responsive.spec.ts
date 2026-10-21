import { expect, test, type Page } from "@playwright/test";
import { seedCommittedPredictions, signInAsFacilitator } from "./helpers";

/**
 * Covers the "Desktop, tablet, and mobile layouts checked" row of
 * workshop/rehearsal-checklist.md.
 *
 * Participants bring whatever device they have. A page that scrolls sideways on a phone
 * hides the controls the whole session is built around, and that is not something a
 * desktop-only e2e run would ever surface.
 */
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 }
];

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  // One pixel of slack for sub-pixel rounding in layout.
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test.describe(`${viewport.name} layout`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("landing and scenario list fit the viewport", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Modeling Choices in Omics" })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.getByRole("link", { name: "Start workshop" }).click();
      await expect(page.getByRole("heading", { name: "Choose a scenario" })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test("scenario module keeps controls and charts usable", async ({ page }) => {
      await seedCommittedPredictions(page);
      await page.goto("/#/scenario/pooled-vs-stratified");
      await expect(page.getByRole("heading", { name: "Model controls" })).toBeVisible();
      await expect(page.getByLabel("Analysis strategy")).toBeVisible();
      await expect(page.getByRole("slider", { name: /European-ancestry share/ })).toBeVisible();
      await expect(page.locator(".chart-surface canvas").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test("facilitator run sheet fits the viewport", async ({ page }) => {
      await signInAsFacilitator(page);
      await expect(page.getByRole("link", { name: "Open module" }).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });
}
