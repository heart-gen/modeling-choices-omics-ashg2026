import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { openFirstScenario, seedCommittedPredictions } from "./helpers";

/**
 * Covers the "Take-home summary export tested" row of workshop/rehearsal-checklist.md.
 *
 * Regression guard for a defect this repository has already had once: the export
 * reconstructed control state from scenario defaults, so "Selected strategy" was always
 * the default no matter what the participant chose. Asserting that the file contains the
 * *non-default* selection is what makes this guard meaningful — checking only that a file
 * downloads passes against the bug.
 */
async function downloadSummary(page: import("@playwright/test").Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export take-home summary" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("omics-modeling-choices-summary.txt");
  const path = await download.path();
  return readFile(path, "utf8");
}

test("the export records the participant's own choices, not the defaults", async ({ page }) => {
  await openFirstScenario(page);

  await page.getByLabel("Analysis strategy").selectOption("stratified");
  await page.getByRole("slider", { name: /European-ancestry share/ }).fill("35");
  await page.getByLabel("Note for this scenario").fill("Check subgroup Ns before pooling.");

  const text = await downloadSummary(page);

  expect(text).toContain("Pooled vs Stratified Analysis");
  expect(text).toContain("Selected strategy: Stratified");
  expect(text).not.toContain("Selected strategy: Pooled");
  expect(text).toContain("European-ancestry share in pooled sample (%): 35");
  expect(text).toContain("Check subgroup Ns before pooling.");
});

test("selections survive leaving a module and coming back", async ({ page }) => {
  await openFirstScenario(page);
  await page.getByLabel("Analysis strategy").selectOption("stratified");
  await page.getByRole("slider", { name: /European-ancestry share/ }).fill("35");

  await page.getByRole("link", { name: "Back to scenarios" }).click();
  await expect(page.getByRole("heading", { name: "Choose a scenario" })).toBeVisible();
  await page.getByRole("link", { name: /Pooled vs Stratified Analysis/ }).click();

  await expect(page.getByLabel("Analysis strategy")).toHaveValue("stratified");
  await expect(page.getByRole("slider", { name: /European-ancestry share/ })).toHaveValue("35");
});

test("the all-modules export covers every module the participant opened", async ({ page }) => {
  await seedCommittedPredictions(page);
  await page.goto("/#/scenario/pooled-vs-stratified");
  await page.getByRole("heading", { name: "Model controls" }).waitFor();
  await page.goto("/#/scenario/within-vs-meta");
  await page.getByRole("heading", { name: "Model controls" }).waitFor();

  await page.goto("/#/scenarios");
  await expect(page.getByRole("heading", { name: "Choose a scenario" })).toBeVisible();

  const text = await downloadSummary(page);
  expect(text).toContain("Pooled vs Stratified Analysis");
  expect(text).toContain("Within-Ancestry Testing vs Meta-Analysis");
  // Not opened, so it must not appear.
  expect(text).not.toContain("Scalable Inference and Who Can Afford It");
});
