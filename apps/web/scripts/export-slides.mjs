/**
 * Writes the content of the slides the organiser deck does not carry — join, agenda, how the
 * modules work, a commit slide, an answer slide and one slide per chart for each module,
 * synthesis — as a manifest, from the scenario bundles and from chart panels captured off the
 * running app. Nothing projected is typed here: questions, options, and answers come from the
 * bundles the validator has already checked against the poll service, and the figures are the
 * app's own pixels at each module's default state.
 *
 * `workshop/slides/build_deck.py` lays the manifest out on the ASHG 2026 speaker template.
 * Text that ASHG's presenter guidelines keep off the slide (nothing under 24 pt, at most six
 * lines) goes to the speaker notes rather than being cut, so the facilitator still has it.
 *
 *   npm run export:slides -- --url https://example.cloudfront.net [--short-url https://short.link] [--out path.json]
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { practicePoll } from "../../../backend/polling/poll.mjs";
import { repoRoot, withRevealedApp } from "./lib/revealed-app.mjs";

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    "short-url": { type: "string" },
    out: { type: "string" }
  }
});
// The deployment the room joins. No default: the join slide's address and QR code must name
// the site this session actually runs on.
const workshopUrl = args.url ?? process.env.WORKSHOP_URL;
if (!workshopUrl) {
  console.error("Pass the workshop URL with --url or WORKSHOP_URL; the join slide prints it and encodes it as a QR code.");
  process.exit(1);
}
// The opening poll's own page (apps/web/src/router.ts); the join slide points at it directly.
const pollUrl = `${workshopUrl.replace(/\/$/, "")}/#/poll`;
// What the join slide prints for the room to type. A CloudFront hostname is 28 characters
// of noise, so a short link that redirects to the workshop URL can stand in for it; the QR
// code always encodes the workshop URL itself.
const shortUrl = args["short-url"] ?? process.env.WORKSHOP_SHORT_URL;
const displayUrl = (shortUrl ?? workshopUrl).replace(/^https?:\/\//, "").replace(/\/$/, "");
const outputPath = resolve(repoRoot, args.out ?? "workshop/slides/platform-slides.json");
const captureRoot = resolve(repoRoot, "workshop/slides/captures");

// The chart slides that carry each module's reveal, one chart per slide. `chart` is matched
// exactly against the `data-chart-title` attribute on each chart card, so a renamed chart
// fails the build rather than leaving a blank on the slide. `state` overrides the module's
// defaults: a reveal shows the state its question describes, not the one the module opens
// in. Every capture uses the app's compare view, so a slide shows every strategy at once —
// there is no select to move on a projected slide. `title` describes `state`, which sits
// beside it, so the two cannot drift apart.
const captures = {
  "pooled-vs-stratified": [
    { chart: "Effect estimates", title: "Effect estimates at 35% European ancestry", state: { ancestryMix: 35 } },
    { chart: "Effect estimates", title: "Effect estimates at 95% European ancestry", state: { ancestryMix: 95 } },
    { chart: "Power curve", title: "Power curve at 95% European ancestry", state: { ancestryMix: 95 } }
  ],
  "within-vs-meta": [
    { chart: "Forest plot", title: "Forest plot at 0% heterogeneity", state: { heterogeneity: 0 } },
    { chart: "Forest plot", title: "Forest plot at 100% heterogeneity", state: { heterogeneity: 100 } }
  ],
  "global-vs-local-ancestry": [
    { chart: "Does it detect the locus?", title: "Does each model detect the locus?" },
    { chart: "Regional signal", title: "Regional signal under each model" }
  ],
  "complexity-power": [
    { chart: "Does it detect the locus?", title: "Does each model detect the locus?" },
    { chart: "Power curve", title: "Power by model and sample size" }
  ],
  "regularization-heterogeneity": [
    { chart: "Calibration by ancestry", title: "Calibration at the starting shrinkage" },
    { chart: "Calibration by ancestry", title: "Calibration at the strongest shrinkage", state: { lambda: 90 } }
  ],
  "scalability-equity": [
    { chart: "One-week feasibility", title: "One-week feasibility on one RM node" },
    { chart: "One-week feasibility", title: "One-week feasibility on one GPU node", state: { modelId: "gpu" } }
  ]
};

const defaultState = (bundle) => Object.fromEntries(bundle.controls.map((control) => [control.id, control.default]));

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * The guide's two-hour table is the organiser-facing agenda, so the slide reads it rather
 * than keeping a third copy. The asserts turn a reshaped table into a build failure.
 */
async function loadAgenda(moduleMinutes) {
  const guide = await readFile(resolve(repoRoot, "workshop/facilitator-guide.md"), "utf8");
  const section = guide.split("## Two-Hour Flow")[1]?.split("\n## ")[0];
  if (!section) throw new Error("facilitator-guide.md: '## Two-Hour Flow' section not found");
  const rows = section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.trim()));
  const [header, divider, ...body] = rows;
  if (header.join("|") !== "Segment|Time|Activity" || !divider[0].startsWith("---")) {
    throw new Error("facilitator-guide.md: two-hour flow table header has changed");
  }
  if (body.length !== 6) throw new Error(`facilitator-guide.md: expected 6 agenda rows, found ${body.length}`);
  const minutes = (cell) => Number(/(\d+)\s*min/.exec(cell)?.[1]);
  const exerciseMinutes = body
    .filter(([segment]) => segment.startsWith("Interactive exercises"))
    .reduce((sum, [, time]) => sum + minutes(time), 0);
  if (exerciseMinutes !== moduleMinutes) {
    throw new Error(`facilitator-guide.md: exercise blocks total ${exerciseMinutes} min, modules total ${moduleMinutes}`);
  }
  return body;
}

// Letters are part of the text rather than list numbering: a lettered list renders as "1."
// in LibreOffice and Keynote, and the facilitator needs to be able to say "hands up for B".
const lettered = (labels) => labels.map((label, position) => `${String.fromCharCode(65 + position)}.  ${label}`);

const correctAnswer = (bundle) =>
  bundle.prediction.options.find((option) => option.id === bundle.prediction.correctOptionId).label;

function joinSlide() {
  return {
    kind: "join",
    eyebrow: "ASHG 2026 · Modeling Choices in Omics",
    title: "Join the platform",
    url: workshopUrl,
    displayUrl,
    displayHref: shortUrl ?? workshopUrl,
    // The poll's own URL is a second long address to type; the top menu links to it.
    lines: ["No account, no install.", "Then open “Opening poll” in the top menu.", practicePoll.question],
    notes: [
      `Workshop: ${workshopUrl}`,
      `Opening poll: ${pollUrl}`,
      "Opening poll options:",
      ...lettered(practicePoll.options.map((option) => option.label))
    ].join("\n")
  };
}

function agendaSlide(agenda, index) {
  const minutes = index.scenarios[0].estimatedMinutes;
  return {
    kind: "table",
    eyebrow: "Agenda",
    title: "Two-hour agenda",
    header: ["Segment", "Time"],
    rows: agenda.map(([segment, time]) => [segment, time]),
    notes: [
      ...agenda.map(([segment, time, activity]) => `${segment} (${time}): ${activity}`),
      `${index.scenarios.length} modules at ${minutes} minutes each, in the order they appear in the platform.`
    ].join("\n\n")
  };
}

function howItWorksSlide(index) {
  const steps = [
    ["Commit", "Answer before any chart appears", "Answer the module's question before any chart or control is visible."],
    ["Room split", "See how the room divided", "The facilitator projects how the room divided, then reveals the answer the precomputed numbers give."],
    ["Explore", "Move every control", "The controls unlock. Move every one and watch the result change; the presets are the entry points."],
    ["Debrief", "What makes another answer right?", "What would have to be true of a real cohort for one of the other answers to be right?"]
  ];
  const minutes = index.scenarios[0].estimatedMinutes;
  return {
    kind: "steps",
    eyebrow: "Every module runs the same way",
    title: "How the modules work",
    steps: steps.map(([name, short]) => [name, short]),
    notes: [
      ...steps.map(([name, , long]) => `${name}: ${long}`),
      `${index.scenarios.length} modules · ${minutes} minutes each · the correct answer is computed from the module's own numbers, never typed in.`
    ].join("\n\n")
  };
}

function moduleSlides(bundle, number, images) {
  const answer = correctAnswer(bundle);
  // The facilitator note opens the charts and why-it-matters closes them.
  const chartNotes = images.map((_, position) => [
    position === 0 ? bundle.interpretation.facilitatorNote : "",
    position === images.length - 1 ? bundle.interpretation.whyItMatters : ""
  ].filter(Boolean).join("\n\n"));
  return [
    {
      kind: "commit",
      module: number,
      eyebrow: `Module ${number} · Commit first`,
      title: bundle.title,
      question: bundle.prediction.question,
      options: lettered(bundle.prediction.options.map((option) => option.label)),
      notes: bundle.interpretation.prompt
    },
    {
      kind: "answer",
      module: number,
      eyebrow: `Module ${number} · Reveal`,
      title: `${bundle.title}: the answer`,
      answer,
      notes: bundle.interpretation.whatChanged
    },
    ...images.map((image, position) => ({
      kind: "chart",
      module: number,
      eyebrow: `Module ${number} · Reveal`,
      title: `Module ${number}: ${image.title}`,
      image: image.path,
      notes: chartNotes[position]
    }))
  ];
}

// Two slides of three modules: six long answers in one table would need 12 pt type.
function synthesisSlides(bundles) {
  const halves = [bundles.slice(0, 3), bundles.slice(3)];
  return halves.map((half, position) => {
    const start = position * 3 + 1;
    return {
      kind: "table",
      eyebrow: "Synthesis · What the room predicted, what the data said",
      title: `What the data said: modules ${start}–${start + half.length - 1}`,
      header: ["Module", "The answer"],
      rows: half.map((bundle, offset) => [`${start + offset} · ${bundle.title}`, correctAnswer(bundle)]),
      notes: half.map((bundle, offset) => `Module ${start + offset}: ${bundle.prediction.question}`).join("\n\n")
    };
  });
}

await mkdir(captureRoot, { recursive: true });

const captured = await withRevealedApp(async ({ index, bundles, openModule, page }) => {
  const missing = index.scenarios.map((entry) => entry.id).filter((id) => !captures[id]);
  if (missing.length) throw new Error(`No capture config for module(s): ${missing.join(", ")}`);

  const result = {};
  for (const [position, bundle] of bundles.entries()) {
    const number = String(position + 1).padStart(2, "0");
    result[bundle.scenarioId] = [];
    for (const { chart, title, state } of captures[bundle.scenarioId]) {
      const unknown = Object.keys(state ?? {}).filter((id) => !bundle.controls.some((control) => control.id === id));
      if (unknown.length) throw new Error(`${bundle.scenarioId}: capture "${title}" sets unknown control(s) ${unknown.join(", ")}`);
      await openModule(bundle.scenarioId, { state: { ...defaultState(bundle), ...state }, compare: true });
      const card = page.locator(`.chart-card[data-chart-title="${chart}"]`);
      const count = await card.count();
      if (count !== 1) {
        throw new Error(`${bundle.scenarioId}: chart title "${chart}" matched ${count} chart cards, expected 1`);
      }
      await card.locator("canvas").waitFor();
      // The sticky top nav otherwise lands on top of a card that scrolled under it, and the
      // card is widened to the slide body's aspect (11.5 x 4.4 in) so the chart fills the
      // slide's width instead of being bounded by its height.
      await page.addStyleTag({ content: ".top-nav { position: static; }" });
      // Lifted above its neighbours, which it overlaps once it is wider than its grid column.
      const widen = (element, on) => {
        Object.assign(element.style, on
          ? { width: "890px", position: "relative", zIndex: "50", background: "#fff" }
          : { width: "", position: "", zIndex: "", background: "" });
      };
      await card.evaluate(widen, true);
      // ECharts resizes to the card after the first paint; give the ResizeObserver a tick.
      await page.waitForTimeout(300);
      const path = resolve(captureRoot, `${number}-${bundle.scenarioId}--${slug(title)}.png`);
      await card.locator(".chart-surface").screenshot({ path });
      await card.evaluate(widen, false);
      result[bundle.scenarioId].push({ title, path: relative(dirname(outputPath), path) });
      console.log(`Captured ${number}-${bundle.scenarioId}--${slug(title)}.png`);
    }
  }
  return { index, bundles, images: result };
}, { deviceScaleFactor: 2 });

const { index, bundles, images } = captured;
const moduleMinutes = index.scenarios.reduce((sum, entry) => sum + entry.estimatedMinutes, 0);
const agenda = await loadAgenda(moduleMinutes);

const slides = [joinSlide(), agendaSlide(agenda, index), howItWorksSlide(index)];
for (const [position, bundle] of bundles.entries()) {
  if (!bundle.prediction) throw new Error(`${bundle.scenarioId} has no prediction block`);
  slides.push(...moduleSlides(bundle, position + 1, images[bundle.scenarioId]));
}
slides.push(...synthesisSlides(bundles));

const titles = slides.map((slide) => slide.title);
const repeated = titles.filter((title, position) => titles.indexOf(title) !== position);
// ASHG's accessibility guidelines ask for a unique title on every slide.
if (repeated.length) throw new Error(`Slide titles are not unique: ${[...new Set(repeated)].join("; ")}`);

await writeFile(outputPath, `${JSON.stringify({ workshopUrl, pollUrl, slides }, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${slides.length} slides)`);

// Run from here rather than chained in package.json: npm appends `-- --url ...` to the end of
// a script, so a chained build would have swallowed the arguments meant for this one.
const build = spawnSync("npm", ["run", "build:deck", "--", "--manifest", outputPath], { cwd: repoRoot, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
