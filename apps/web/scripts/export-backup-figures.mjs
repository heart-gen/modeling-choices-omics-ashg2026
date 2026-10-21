import { resolve } from "node:path";
import { repoRoot, withRevealedApp } from "./lib/revealed-app.mjs";

const outputRoot = resolve(repoRoot, "data/figures-backup");

// These figures are the session's fallback when the venue network fails, so they must show
// each module fully revealed — which `withRevealedApp` guarantees by committing every
// prediction before the page loads.
await withRevealedApp(async ({ index, openModule, page }) => {
  for (const [position, entry] of index.scenarios.entries()) {
    const number = String(position + 1).padStart(2, "0");
    await openModule(entry.id);
    await page.screenshot({
      path: resolve(outputRoot, `${number}-${entry.id}.png`),
      fullPage: true
    });
    console.log(`Exported ${number}-${entry.id}.png`);
  }
});
