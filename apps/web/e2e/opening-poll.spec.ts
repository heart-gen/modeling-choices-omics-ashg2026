import { expect, test } from "@playwright/test";

/**
 * The opening poll has its own page, reachable from the landing page and the top nav, so the
 * join slide can point at one URL. No polling backend runs during e2e, which is the
 * static-first case: the page must say so and still send the participant to the modules.
 */
test("the opening poll is its own page and degrades to the modules", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Opening poll" }).first().click();
  await expect(page.getByRole("heading", { name: "Opening poll" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Polling is unavailable" })).toBeVisible();

  await page.getByRole("link", { name: "Start the modules" }).click();
  await expect(page.getByRole("heading", { name: "Choose a scenario" })).toBeVisible();
});

test("the facilitator run sheet prints the poll join link", async ({ page }) => {
  await page.goto("/facilitator");
  await page.getByLabel("Username").fill("facilitator");
  await page.getByLabel("Password").fill("ashg2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Participants answer at/)).toContainText("#/poll");
});
