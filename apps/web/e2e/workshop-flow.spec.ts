import { expect, test } from "@playwright/test";
import { seedCommittedPredictions } from "./helpers";

test("participant can open a scenario and change the model", async ({ page }) => {
  await seedCommittedPredictions(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Start workshop" }).click();
  await page.getByRole("link", { name: /Pooled vs Stratified Analysis/ }).click();
  await expect(page.getByRole("heading", { name: "Pooled vs Stratified Analysis" })).toBeVisible();
  await page.getByLabel("Analysis strategy").selectOption("stratified");
  await expect(page.getByText("Why this matters")).toBeVisible();
});

test("moving a slider changes a precomputed chart series", async ({ page }) => {
  await seedCommittedPredictions(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Start workshop" }).click();
  await page.getByRole("link", { name: /Pooled vs Stratified Analysis/ }).click();

  const chartTable = page.locator('[data-chart-title="Effect estimates"] table');
  const before = await chartTable.textContent();
  await page.getByRole("slider", { name: /European-ancestry share/ }).fill("35");

  await expect.poll(() => chartTable.textContent()).not.toBe(before);
});

test("facilitator view shows run sheet", async ({ page }) => {
  await page.goto("/facilitator");
  await expect(page.getByRole("heading", { name: "Facilitator sign in" })).toBeVisible();
  await page.getByLabel("Username").fill("facilitator");
  await page.getByLabel("Password").fill("ashg2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Facilitator run sheet" })).toBeVisible();
  await expect(page.getByText("Instructor note").first()).toBeVisible();
});

// Regression guard: hash links inside the run sheet were inert because parseLocation
// short-circuited on the /facilitator pathname before reading the hash.
test("facilitator can open a module from the run sheet", async ({ page }) => {
  await page.goto("/facilitator");
  await page.getByLabel("Username").fill("facilitator");
  await page.getByLabel("Password").fill("ashg2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Facilitator run sheet" })).toBeVisible();

  await page.getByRole("link", { name: "Open module" }).first().click();
  // Assert on chrome unique to the scenario page. The run sheet also renders each module
  // title as a heading, so asserting on the title alone passes even when navigation is
  // broken.
  await expect(page.getByRole("heading", { name: "Model controls" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to scenarios" })).toBeVisible();
});
