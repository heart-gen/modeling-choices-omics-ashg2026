import { expect, test } from "@playwright/test";
import { chartTable, openFirstScenario, seedCommittedPredictions } from "./helpers";

/**
 * Covers the "Keyboard navigation checked for all controls" row of
 * workshop/rehearsal-checklist.md.
 *
 * The workshop foregrounds equitable participation; a participant who cannot use a mouse
 * has to be able to make the same analytic choices as everyone else in the room. These
 * assert on the chart's data table, so they fail if a control is reachable by keyboard but
 * does not actually change the result.
 */
test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeVisible();
});

test("the analysis strategy select is operable by keyboard", async ({ page }) => {
  await openFirstScenario(page);
  const table = chartTable(page, "Effect estimates");
  const before = await table.textContent();

  const select = page.getByLabel("Analysis strategy");
  await select.focus();
  await expect(select).toBeFocused();
  await select.press("ArrowDown");
  await expect(select).not.toHaveValue("pooled");

  // The selected strategy is encoded in the chart as opacity, and in the data table as a
  // "selected" column. Asserting on the table is what proves the choice is conveyed to
  // assistive technology and not only to sighted users.
  await expect.poll(() => table.textContent()).not.toBe(before);
});

test("the ancestry-mix slider is operable by keyboard", async ({ page }) => {
  await openFirstScenario(page);
  const table = chartTable(page, "Effect estimates");
  const before = await table.textContent();

  // Role-scoped: a module's prediction question can repeat a control's wording, and the
  // vote panel is labelled by that question, so a bare getByLabel matches both.
  const slider = page.getByRole("slider", { name: /European-ancestry share/ });
  await slider.focus();
  await expect(slider).toBeFocused();
  const startValue = await slider.inputValue();

  await slider.press("ArrowRight");
  await expect(slider).not.toHaveValue(startValue);
  await expect.poll(() => table.textContent()).not.toBe(before);

  // And back again, so the control is genuinely bidirectional rather than clamped.
  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue(startValue);
});

test("every control on every module is reachable and labelled", async ({ page }) => {
  // This test is about keyboard reachability, not about the prediction gate.
  await seedCommittedPredictions(page);
  const modules = [
    "pooled-vs-stratified",
    "within-vs-meta",
    "global-vs-local-ancestry",
    "complexity-power",
    "regularization-heterogeneity",
    "scalability-equity"
  ];

  for (const moduleId of modules) {
    await page.goto(`/#/scenario/${moduleId}`);
    await page.getByRole("heading", { name: "Model controls" }).waitFor();
    const controls = page.locator(".control-grid input, .control-grid select");
    const count = await controls.count();
    expect(count, `${moduleId} renders no controls`).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      await control.focus();
      await expect(control, `${moduleId} control ${index} cannot take focus`).toBeFocused();
      // A control with no accessible name is unusable with a screen reader even when it
      // is reachable with Tab.
      const accessibleName = await control.evaluate((element) => {
        const label = element.closest("label");
        return label?.textContent?.trim() ?? "";
      });
      expect(accessibleName, `${moduleId} control ${index} has no label`).not.toBe("");
    }
  }
});
