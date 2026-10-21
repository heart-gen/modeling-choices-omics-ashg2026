import { expect, test } from "@playwright/test";
import { chartTable, seedCommittedPredictions } from "./helpers";

/**
 * Module 2's "Evidence synthesis" select used to change only the association table: the
 * forest plot and the heterogeneity panel ignored it, so the control the module is named
 * after had no visible consequence on the chart it is about. It now draws what the selected
 * synthesis reports. Assert on the charts' own data tables rather than on pixels, so the
 * guard reads what a screen reader would.
 */
test("the synthesis select changes the forest plot and the reported evidence", async ({ page }) => {
  await seedCommittedPredictions(page);
  await page.goto("/#/scenario/within-vs-meta");
  await page.getByRole("heading", { name: "Model controls" }).waitFor();

  const forest = chartTable(page, "Forest plot");
  const reported = chartTable(page, "What this synthesis reports");
  await expect(forest).toContainText("Fixed-effect summary");
  const forestBefore = await forest.textContent();
  const reportedBefore = await reported.textContent();

  await page.getByLabel("Evidence synthesis").selectOption("random_meta");

  await expect.poll(() => forest.textContent()).not.toBe(forestBefore);
  await expect.poll(() => reported.textContent()).not.toBe(reportedBefore);
});
