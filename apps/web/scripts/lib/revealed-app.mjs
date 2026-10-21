/**
 * Shared harness for the scripts that drive the built app in a real browser: the backup
 * figure export, the control audit, and the slide export. Each needs the same three things
 * — a dev server, a Chromium page, and every module already revealed — and each used to
 * carry its own copy of the code that provides them.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const webRoot = resolve(repoRoot, "apps/web");
const scenarioRoot = resolve(repoRoot, "data/scenarios");
export const baseUrl = "http://127.0.0.1:5173";
const selectionsKey = "omics-export-selections";

/** The committed bundles, in index order — the same files `sync-data` copies into the app. */
export async function loadScenarioBundles() {
  const index = JSON.parse(await readFile(resolve(scenarioRoot, "index.json"), "utf8"));
  const bundles = await Promise.all(index.scenarios.map(async (entry) =>
    JSON.parse(await readFile(resolve(scenarioRoot, entry.file), "utf8"))
  ));
  return { index, bundles };
}

/**
 * A module that opens with a committed prediction renders neither charts nor controls
 * until the prediction is in. Seeding the derived answer puts every module in the state a
 * participant is in while they explore, which is the state worth capturing or auditing.
 */
export function committedPredictions(bundles) {
  return Object.fromEntries(
    bundles
      .filter((bundle) => bundle.prediction)
      .map((bundle) => [bundle.scenarioId, bundle.prediction.correctOptionId])
  );
}

function healthCheck() {
  return new Promise((resolveCheck, reject) => {
    const request = http.get(baseUrl, (response) => {
      response.resume();
      response.statusCode < 500 ? resolveCheck() : reject(new Error("Dev server is not ready"));
    });
    request.on("error", reject);
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await healthCheck();
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error("Dev server did not become ready");
}

/** Starts `npm run dev` detached so the whole process group can be stopped at the end. */
export async function startDevServer() {
  const server = spawn("npm", ["run", "dev"], {
    cwd: webRoot,
    detached: true,
    env: {
      ...process.env,
      VITE_FACILITATOR_USERNAME: "facilitator",
      VITE_FACILITATOR_PASSWORD: "ashg2026"
    },
    stdio: "ignore"
  });
  await waitUntilReady();
  return {
    stop() {
      if (server.pid) process.kill(-server.pid, "SIGTERM");
    }
  };
}

/**
 * Runs `run({ page, index, bundles, openModule })` against the app with every prediction
 * committed, then tears the browser and server down whatever happened.
 *
 * Reduced motion is the default: `EChartPanel` disables chart animation under it, so a
 * screenshot cannot catch a mid-animation frame.
 */
export async function withRevealedApp(run, options = {}) {
  const {
    viewport = { width: 1440, height: 1000 },
    deviceScaleFactor = 1,
    reducedMotion = "reduce"
  } = options;
  const { index, bundles } = await loadScenarioBundles();
  const server = await startDevServer();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport, deviceScaleFactor, reducedMotion });
    // globalThis rather than window: this callback is serialised into the page, but it is
    // linted as Node source, where `window` is undefined. Selections come from session
    // storage when `openModule` was asked for a control state, and are empty otherwise.
    await page.addInitScript(([summary, selectionsKey]) => {
      const selections = globalThis.sessionStorage.getItem(selectionsKey);
      globalThis.localStorage.setItem("omics-modeling-choices-summary", JSON.stringify({
        ...summary,
        selections: selections ? JSON.parse(selections) : {}
      }));
    }, [{ visitedScenarioIds: [], notes: {}, predictions: committedPredictions(bundles) }, selectionsKey]);

    /**
     * Opens a module at its defaults, or at `state` (a complete control state) when given.
     * `compare` adds the app's `?compare` view, which draws every strategy on the panels the
     * model select otherwise filters.
     */
    async function openModule(scenarioId, { state, compare = false } = {}) {
      await page.goto(`${baseUrl}/${compare ? "?compare" : ""}#scenario/${scenarioId}`);
      const seeded = state ? JSON.stringify({ [scenarioId]: state }) : null;
      const changed = await page.evaluate(([key, value]) => {
        const before = globalThis.sessionStorage.getItem(key);
        if (value === null) globalThis.sessionStorage.removeItem(key);
        else globalThis.sessionStorage.setItem(key, value);
        return before !== value;
      }, [selectionsKey, seeded]);
      // The summary is read once, on load: a new state needs a reload to reach the app.
      if (changed) await page.reload();
      await page.getByRole("heading", { name: "Model controls" }).waitFor();
      await page.locator(".chart-surface canvas").first().waitFor();
    }

    return await run({ page, index, bundles, openModule });
  } finally {
    await browser?.close();
    server.stop();
  }
}
