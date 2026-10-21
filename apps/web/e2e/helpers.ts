import type { Page } from "@playwright/test";

/** Matches the credentials playwright.config.ts builds the dev server with. */
export async function signInAsFacilitator(page: Page) {
  await page.goto("/facilitator");
  await page.getByLabel("Username").fill("facilitator");
  await page.getByLabel("Password").fill("ashg2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Facilitator run sheet" }).waitFor();
}

/**
 * Pre-commits the prediction for every module that gates its controls behind one, so a spec
 * about something else (keyboard reachability, layout, the take-home export) sees the
 * unlocked module. The prediction flow itself is covered by prediction.spec.ts, which does
 * not seed.
 *
 * These are each module's derived answer. Any option id would unlock the module, but the
 * real ones keep the revealed panel sensible; `npm run validate:data` fails if an id here
 * ever stops matching backend/polling/poll.mjs.
 */
export async function seedCommittedPredictions(page: Page) {
  await page.addInitScript((summary) => {
    window.localStorage.setItem("omics-modeling-choices-summary", JSON.stringify(summary));
  }, {
    visitedScenarioIds: [],
    notes: {},
    selections: {},
    predictions: {
      "pooled-vs-stratified": "toward-european",
      "within-vs-meta": "stays-narrow",
      "global-vs-local-ancestry": "local_interaction",
      "complexity-power": "global-and-covariate",
      "regularization-heterogeneity": "group_aware",
      "scalability-equity": "standard-and-local"
    }
  });
}

export async function openFirstScenario(page: Page) {
  await seedCommittedPredictions(page);
  await page.goto("/#/scenario/pooled-vs-stratified");
  await page.getByRole("heading", { name: "Model controls" }).waitFor();
  await page.locator(".chart-surface canvas").first().waitFor();
}

/**
 * The rendered text of a chart's visually-hidden data table. Chart pixels live in a
 * canvas, so this table is the cheapest reliable proxy for "the chart actually changed" —
 * and asserting on it also confirms the accessible representation stays in sync.
 */
export function chartTable(page: Page, title: string) {
  return page.locator(`[data-chart-title="${title}"] table`);
}
