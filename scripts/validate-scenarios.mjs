import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { polls } from "../backend/polling/poll.mjs";

// fileURLToPath, not URL.pathname: the latter is percent-encoded and breaks on any
// checkout path containing a space.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenarioDir = resolve(root, "data/scenarios");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate value: ${value}`);
    seen.add(value);
  }
}

function controlValues(control, label) {
  if (Array.isArray(control.values)) {
    return control.values.map((option) => option.value);
  }
  if (control.type === "toggle") return [false, true];
  if (control.type === "slider") {
    assert(Number.isFinite(control.min), `${label}: slider is missing min`);
    assert(Number.isFinite(control.max), `${label}: slider is missing max`);
    assert(Number.isFinite(control.step) && control.step > 0, `${label}: slider has invalid step`);
    const values = [];
    for (let value = control.min; value <= control.max + control.step / 1000; value += control.step) {
      values.push(Number(value.toFixed(10)));
    }
    return values;
  }
  return [control.default];
}

/** Mirrors `gridKeyPart` in apps/web/src/scenarioUtils.ts and `js_key` in the generator. */
function gridKeyPart(value) {
  return typeof value === "number" ? String(Number(value.toFixed(10))) : String(value);
}

function cartesian(lists) {
  return lists.reduce((combinations, list) => combinations.flatMap((prefix) => list.map((value) => [...prefix, value])), [[]]);
}

function validateVizSeries(series, key, scenario, filename) {
  const label = `${filename}: vizSummaries.${key}`;
  if (Array.isArray(series)) return;

  assert(series && typeof series === "object", `${label} must be an array or control-keyed grid`);
  assert(series.values && typeof series.values === "object" && !Array.isArray(series.values), `${label}.values must be an object`);

  if (series.byControls !== undefined) {
    assert(Array.isArray(series.byControls) && series.byControls.length > 1, `${label}.byControls must list at least two control ids`);
    unique(series.byControls, `${label}.byControls`);
    const domains = series.byControls.map((id) => {
      const control = scenario.controls.find((candidate) => candidate.id === id);
      assert(control, `${label} references missing control: ${id}`);
      return controlValues(control, `${filename}: control ${control.id}`);
    });
    // Every combination a participant can reach must resolve. A missing one does not
    // error in the app; it silently falls back to the defaults and the sliders look inert.
    for (const combination of cartesian(domains)) {
      const keyForValues = combination.map(gridKeyPart).join("|");
      assert(Array.isArray(series.values[keyForValues]), `${label} is missing combination: ${keyForValues}`);
    }
    return;
  }

  assert(typeof series.byControl === "string", `${label}.byControl must be a control id`);
  const control = scenario.controls.find((candidate) => candidate.id === series.byControl);
  assert(control, `${label} references missing control: ${series.byControl}`);
  for (const value of controlValues(control, `${filename}: control ${control.id}`)) {
    const keyForValue = gridKeyPart(value);
    assert(Object.hasOwn(series.values, keyForValue), `${label} is missing control value: ${keyForValue}`);
    assert(Array.isArray(series.values[keyForValue]), `${label}.values.${keyForValue} must be an array`);
  }
}

/**
 * The provenance block is the evidence for the abstract's calibration claim, and
 * ProvenancePanel.tsx renders it verbatim. Asserting on every field the panel reads means
 * a generator change cannot quietly ship a module whose "how these numbers were produced"
 * section is blank — which would be worse than not showing one at all.
 */
function validateProvenance(scenario, filename) {
  const provenance = scenario.provenance;
  const label = `${filename}: provenance`;
  assert(provenance && typeof provenance === "object", `${label} is missing`);
  assert(provenance.generator, `${label}.generator is missing`);
  assert(provenance.generatorVersion, `${label}.generatorVersion is missing`);
  assert(Number.isFinite(provenance.seed), `${label}.seed must be a number`);
  assert(Number.isFinite(provenance.alpha), `${label}.alpha must be a number`);
  assert(provenance.realInputs && typeof provenance.realInputs === "object", `${label}.realInputs is missing`);

  const referenceFrequencies = provenance.realInputs.alleleFrequencies ?? [];
  assert(Array.isArray(referenceFrequencies), `${label}.realInputs.alleleFrequencies must be an array`);
  for (const frequency of referenceFrequencies) {
    for (const field of ["rsid", "gene", "locus", "trait", "source", "note"]) {
      assert(frequency[field], `${label}.realInputs.alleleFrequencies entry is missing ${field}`);
    }
  }
  assert(
    referenceFrequencies.length > 0 || provenance.realInputs.ancestryDistribution,
    `${label}.realInputs must cite at least one real input`
  );

  for (const field of ["syntheticInputs", "assumptions"]) {
    assert(Array.isArray(provenance[field]) && provenance[field].length > 0, `${label}.${field} must be a non-empty array`);
    assert(provenance[field].every((entry) => typeof entry === "string" && entry.trim()), `${label}.${field} entries must be non-empty strings`);
  }
  assert(typeof provenance.derived === "string" && provenance.derived.trim(), `${label}.derived is missing`);

  if (scenario.variant !== undefined) {
    for (const field of ["rsid", "gene", "locus", "trait"]) {
      assert(scenario.variant[field], `${filename}: variant is missing ${field}`);
    }
  }
}

/** An information card is prose the app renders verbatim; a blank one is worse than none. */
function validateInfoPanels(scenario, filename) {
  if (scenario.infoPanels === undefined) return;
  const label = `${filename}: infoPanels`;
  assert(Array.isArray(scenario.infoPanels) && scenario.infoPanels.length > 0, `${label} must be a non-empty array`);
  for (const panel of scenario.infoPanels) {
    assert(typeof panel.title === "string" && panel.title.trim(), `${label} entry is missing a title`);
    assert(
      Array.isArray(panel.paragraphs) && panel.paragraphs.length > 0 && panel.paragraphs.every((text) => typeof text === "string" && text.trim()),
      `${label} "${panel.title}" must carry non-empty paragraphs`
    );
  }
}

/** Modules whose design depends on a committed prediction opening the module. */
const requiredPredictions = new Set([
  "pooled-vs-stratified",
  "within-vs-meta",
  "global-vs-local-ancestry",
  "complexity-power",
  "regularization-heterogeneity",
  "scalability-equity"
]);

/**
 * A module prediction must agree with the poll service exactly. A label that differs from
 * backend/polling/poll.mjs projects one answer and counts another, and an unknown poll id
 * turns every vote into a 404.
 */
function validatePrediction(scenario, filename) {
  const prediction = scenario.prediction;
  const label = `${filename}: prediction`;
  if (prediction === undefined) {
    assert(!requiredPredictions.has(scenario.scenarioId), `${label} is required for ${scenario.scenarioId}`);
    return;
  }
  const poll = polls.get(prediction.pollId);
  assert(poll, `${label}.pollId ${prediction.pollId} is not defined in backend/polling/poll.mjs`);
  assert(prediction.question === poll.question, `${label}.question differs from backend/polling/poll.mjs`);
  assert(
    Array.isArray(prediction.options) && prediction.options.length === poll.options.length,
    `${label}.options must match backend/polling/poll.mjs`
  );
  prediction.options.forEach((option, index) => {
    const expected = poll.options[index];
    assert(
      option.id === expected.id && option.label === expected.label,
      `${label}.options[${index}] differs from backend/polling/poll.mjs (${expected.id}: ${expected.label})`
    );
  });
  assert(
    prediction.options.some((option) => option.id === prediction.correctOptionId),
    `${label}.correctOptionId must be one of its options`
  );
}

function validatePresets(scenario, filename) {
  if (scenario.presets === undefined) return;
  const label = `${filename}: presets`;
  assert(Array.isArray(scenario.presets) && scenario.presets.length > 0, `${label} must be a non-empty array`);
  unique(scenario.presets.map((preset) => preset.id), `${label} ids`);
  for (const preset of scenario.presets) {
    assert(preset.label && preset.description, `${label}.${preset.id} needs a label and a description`);
    assert(preset.state && Object.keys(preset.state).length > 0, `${label}.${preset.id} must set at least one control`);
    for (const [controlId, value] of Object.entries(preset.state)) {
      const control = scenario.controls.find((candidate) => candidate.id === controlId);
      assert(control, `${label}.${preset.id} sets missing control: ${controlId}`);
      const allowed = controlValues(control, `${filename}: control ${controlId}`).map(gridKeyPart);
      assert(
        allowed.includes(gridKeyPart(value)),
        `${label}.${preset.id} sets ${controlId} to ${value}, which that control cannot take`
      );
    }
  }
}

/**
 * Chart keys whose builder in ScenarioCharts.tsx uses `yAxis: { type: "log" }`, and the
 * numeric field each one plots.
 *
 * log(0) does not exist, so a zero is not drawn small — it is not drawn at all. A GPU
 * runtime that rounds to 0.0 silently deletes the bar that carries the scalability
 * module's entire argument, while every other check in the repository still passes.
 */
const logAxisSeries = {
  runtimeCurve: "hours",
  costCurve: "usd",
  allocationCurve: "su",
  feasibility: "hours"
};

/**
 * A columnar chart series stores its x-axis once and each cell's y-values as plain arrays.
 * Nothing downstream notices a length mismatch: the chart would silently plot a truncated
 * curve, or drop points off the end, with every other check still green.
 */
function validateColumnarLengths(scenario, filename) {
  const positionsSeries = scenario.vizSummaries.regionalPositions;
  const regional = scenario.vizSummaries.regional;
  if (!positionsSeries || !regional) return;
  const positions = Array.isArray(positionsSeries) ? positionsSeries[0]?.positions : undefined;
  assert(Array.isArray(positions) && positions.length > 0, `${filename}: vizSummaries.regionalPositions must hold a non-empty positions array`);
  const cells = Array.isArray(regional) ? { flat: regional } : regional.values;
  for (const [controlValue, rows] of Object.entries(cells)) {
    assert(rows.length === 1, `${filename}: vizSummaries.regional[${controlValue}] must hold exactly one columnar row`);
    for (const [key, column] of Object.entries(rows[0])) {
      assert(
        Array.isArray(column) && column.length === positions.length,
        `${filename}: vizSummaries.regional[${controlValue}].${key} has ${Array.isArray(column) ? column.length : "no"} values for ${positions.length} positions`
      );
    }
  }
}

function validateLogAxisValues(scenario, filename) {
  for (const [key, field] of Object.entries(logAxisSeries)) {
    const series = scenario.vizSummaries[key];
    if (!series) continue;
    const groups = Array.isArray(series) ? { flat: series } : series.values;
    for (const [controlValue, rows] of Object.entries(groups)) {
      for (const row of rows) {
        const value = row[field];
        assert(
          typeof value === "number" && Number.isFinite(value) && value > 0,
          `${filename}: vizSummaries.${key}[${controlValue}] has a non-positive ${field} (${value}), which cannot be plotted on a logarithmic axis`
        );
      }
    }
  }
}

const requiredVizKeys = {
  "pooled-vs-stratified": ["effectComparisons", "powerCurve", "discussionPrompts"],
  "within-vs-meta": ["forest", "reported", "heterogeneity", "discussionPrompts"],
  "global-vs-local-ancestry": [
    "regional",
    "regionalPositions",
    "regionalThreshold",
    "detection",
    "localAncestryComposition",
    "discussionPrompts"
  ],
  "complexity-power": ["detection", "forest", "powerCurve", "discussionPrompts"],
  "regularization-heterogeneity": ["performanceCards", "calibration", "coefficientPath", "discussionPrompts"],
  "scalability-equity": ["runtimeCurve", "costCurve", "allocationCurve", "allocationReference", "feasibility", "discussionPrompts"]
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const index = await readJson(resolve(scenarioDir, "index.json"));
assert(Array.isArray(index.scenarios), "index.json must contain scenarios[]");
unique(index.scenarios.map((scenario) => scenario.id), "scenario ids");

for (const entry of index.scenarios) {
  const scenario = await readJson(resolve(scenarioDir, entry.file));
  assert(scenario.schemaVersion, `${entry.file}: missing schemaVersion`);
  assert(scenario.scenarioId === entry.id, `${entry.file}: scenarioId must match index id`);
  assert(scenario.title, `${entry.file}: missing title`);
  assert(Array.isArray(scenario.learningObjectives) && scenario.learningObjectives.length > 0, `${entry.file}: missing learning objectives`);
  if (scenario.ancestryGroups !== undefined) {
    assert(Array.isArray(scenario.ancestryGroups), `${entry.file}: ancestryGroups must be an array`);
    unique(scenario.ancestryGroups.map((group) => group.id), `${entry.file}: ancestry group ids`);
  }
  if (scenario.alleleFrequencies !== undefined) {
    assert(Array.isArray(scenario.alleleFrequencies), `${entry.file}: alleleFrequencies must be an array`);
  }
  assert(Array.isArray(scenario.controls) && scenario.controls.length > 0, `${entry.file}: missing controls`);
  unique(scenario.controls.map((control) => control.id), `${entry.file}: control ids`);
  assert(Array.isArray(scenario.associationResults), `${entry.file}: associationResults must be an array`);
  assert(Array.isArray(scenario.powerEstimates), `${entry.file}: powerEstimates must be an array`);
  assert(scenario.interpretation?.prompt, `${entry.file}: missing interpretation.prompt`);
  assert(scenario.interpretation?.whyItMatters, `${entry.file}: missing interpretation.whyItMatters`);
  assert(scenario.vizSummaries && typeof scenario.vizSummaries === "object", `${entry.file}: missing vizSummaries`);
  const required = requiredVizKeys[scenario.scenarioId];
  assert(required, `${entry.file}: validator has no vizSummaries contract for ${scenario.scenarioId}`);
  for (const key of required) {
    assert(Object.hasOwn(scenario.vizSummaries, key), `${entry.file}: missing vizSummaries.${key}`);
  }
  for (const [key, series] of Object.entries(scenario.vizSummaries)) {
    validateVizSeries(series, key, scenario, entry.file);
  }
  validateColumnarLengths(scenario, entry.file);
  validateLogAxisValues(scenario, entry.file);
  validateProvenance(scenario, entry.file);
  validateInfoPanels(scenario, entry.file);
  validatePrediction(scenario, entry.file);
  validatePresets(scenario, entry.file);
}

console.log(`Validated ${index.scenarios.length} scenario bundles.`);
