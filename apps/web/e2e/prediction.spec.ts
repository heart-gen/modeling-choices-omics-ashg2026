import { expect, test } from "@playwright/test";
import { chartTable } from "./helpers";

/**
 * The commit-then-reveal gate on Global vs Local Ancestry.
 *
 * The point of the gate is that results are not visible before a participant takes a
 * position, so the meaningful assertions are that the charts are absent first and present
 * after — not merely that a radio button can be clicked.
 *
 * No polling backend runs during e2e, which is the static-first case: committing must still
 * unlock the module and still reveal the explanation.
 */
const moduleUrl = "/#/scenario/global-vs-local-ancestry";

test("results and controls stay hidden until a prediction is committed", async ({ page }) => {
  await page.goto(moduleUrl);

  await expect(page.getByRole("heading", { name: "Model controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Results hidden" })).toBeVisible();
  await expect(page.locator(".control-grid input, .control-grid select")).toHaveCount(0);
  await expect(page.locator(".chart-surface canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lock in prediction" })).toBeDisabled();
});

test("committing a prediction unlocks the module and reveals the answer", async ({ page }) => {
  await page.goto(moduleUrl);

  await page.getByRole("radio", { name: "Adding local ancestry as a covariate" }).check();
  await page.getByRole("button", { name: "Lock in prediction" }).click();

  // The intuitive wrong answer: the verdict has to name both what they picked and the
  // derived answer, or the reveal teaches nothing.
  await expect(page.getByText(/You chose/)).toContainText("Adding local ancestry as a covariate");
  await expect(page.getByText(/the answer is/)).toContainText("Local ancestry interaction");
  await expect(page.getByRole("heading", { name: "What changed?" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Results hidden" })).toHaveCount(0);
  await expect(page.locator(".chart-surface canvas").first()).toBeVisible();
  await expect(page.getByLabel(/Effect on African-ancestry haplotypes/)).toBeVisible();
});

test("a committed prediction survives a reload", async ({ page }) => {
  await page.goto(moduleUrl);
  await page.getByRole("radio", { name: "Local ancestry interaction" }).check();
  await page.getByRole("button", { name: "Lock in prediction" }).click();
  await expect(page.locator(".chart-surface canvas").first()).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Results hidden" })).toHaveCount(0);
  await expect(page.getByText(/You called it/)).toBeVisible();
});

test("a preset changes the precomputed results", async ({ page }) => {
  await page.goto(moduleUrl);
  await page.getByRole("radio", { name: "Local ancestry interaction" }).check();
  await page.getByRole("button", { name: "Lock in prediction" }).click();

  const table = chartTable(page, "Does it detect the locus?");
  await expect(table).toContainText("Global ancestry PCs");
  const before = await table.textContent();

  // Same-direction effects are the module's counter-lesson: the plain scan detects the
  // locus, so this must visibly change the verdicts.
  await page.getByRole("button", { name: "Same effect, different frequency" }).click();

  await expect.poll(() => table.textContent()).not.toBe(before);
});
