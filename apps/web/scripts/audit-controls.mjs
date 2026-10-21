import { withRevealedApp } from "./lib/revealed-app.mjs";

// Every control must visibly change the rendered charts. Inert sliders passed every other
// check in this repository for months; this is the one that would have caught them.
await withRevealedApp(async ({ bundles, openModule, page }) => {
  for (const scenario of bundles) {
    for (const control of scenario.controls) {
      await openModule(scenario.scenarioId);
      const charts = page.locator(".chart-grid");
      const before = await charts.screenshot();
      // Scoped to the control panel: a prediction question that contains a control's label
      // ("Polygenic score" inside "Three polygenic scores...") also labels its own region.
      const field = page.locator(".control-grid").getByLabel(control.label, { exact: false });

      if (control.type === "select") {
        const alternate = control.values.find((option) => option.value !== control.default);
        await field.selectOption(alternate.value);
      } else if (control.type === "toggle") {
        await field.setChecked(!control.default);
      } else {
        const alternate = control.default === control.min ? control.max : control.min;
        await field.fill(String(alternate));
      }

      await page.waitForTimeout(100);
      const after = await charts.screenshot();
      if (before.equals(after)) {
        throw new Error(`${scenario.scenarioId}: ${control.id} produced no visible chart change`);
      }
      console.log(`${scenario.scenarioId}: ${control.id} visibly changed the rendered results`);
    }
  }
});
