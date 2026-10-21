import type { ControlState, ScenarioBundle, ScenarioControl, VizSeriesGrid, VizSeriesMultiGrid } from "./types";

export function defaultControlState(scenario: ScenarioBundle): ControlState {
  return Object.fromEntries(scenario.controls.map((control) => [control.id, control.default]));
}

export function getModelLabel(scenario: ScenarioBundle, modelId: string): string {
  const modelControl = scenario.controls.find((control) => control.id === "modelId");
  return modelControl?.values?.find((value) => value.value === modelId)?.label ?? modelId;
}

export function selectedModelId(scenario: ScenarioBundle, state: ControlState): string {
  const model = state.modelId;
  if (typeof model === "string") return model;
  const fallback = scenario.controls.find((control) => control.id === "modelId")?.default;
  return typeof fallback === "string" ? fallback : "default";
}

/**
 * One control value as it appears in a grid key. Numbers are normalised to ten decimal
 * places first, because stepping a range input can yield -0.039999999999999994 where the
 * generator wrote -0.04. scripts/validate-scenarios.mjs and the generator's `js_key`
 * apply the same rule.
 */
export function gridKeyPart(value: string | number | boolean | undefined): string {
  return typeof value === "number" ? String(Number(value.toFixed(10))) : String(value);
}

function multiGridKey(scenario: ScenarioBundle, controlIds: string[], state: ControlState): string {
  return controlIds
    .map((id) => gridKeyPart(state[id] ?? scenario.controls.find((control) => control.id === id)?.default))
    .join("|");
}

function isMultiGrid(series: VizSeriesGrid | VizSeriesMultiGrid): series is VizSeriesMultiGrid {
  return Array.isArray((series as VizSeriesMultiGrid).byControls);
}

export function resolveVizSeries(
  scenario: ScenarioBundle,
  key: string,
  state: ControlState
): unknown[] {
  const series = scenario.vizSummaries[key];
  if (Array.isArray(series)) return series;
  if (!series || typeof series !== "object") return [];

  if (isMultiGrid(series)) {
    const current = series.values[multiGridKey(scenario, series.byControls, state)];
    if (Array.isArray(current)) return current;
    // Same stale-state rule as a single-control grid below: the declared defaults, then
    // the first valid precomputed series.
    const defaults = series.values[multiGridKey(scenario, series.byControls, {})];
    if (Array.isArray(defaults)) return defaults;
    return Object.values(series.values).find(Array.isArray) ?? [];
  }

  if (typeof series.byControl !== "string") return [];

  const control = scenario.controls.find((candidate) => candidate.id === series.byControl);
  const currentValue = state[series.byControl] ?? control?.default;
  const currentSeries = series.values[gridKeyPart(currentValue)];
  if (Array.isArray(currentSeries)) return currentSeries;

  // A stale saved state should not blank a chart after a bundle changes. Prefer the
  // declared default, then the first valid precomputed series as a final safe fallback.
  const defaultSeries = series.values[gridKeyPart(control?.default)];
  if (Array.isArray(defaultSeries)) return defaultSeries;
  return Object.values(series.values).find(Array.isArray) ?? [];
}

export function formatPValue(value: number): string {
  if (value < 0.000001) return value.toExponential(1);
  if (value < 0.001) return value.toExponential(2);
  return value.toFixed(3);
}

export function getDiscussionPrompts(scenario: ScenarioBundle): string[] {
  const prompts = resolveVizSeries(scenario, "discussionPrompts", {});
  return Array.isArray(prompts) ? prompts.filter((item): item is string => typeof item === "string") : [];
}

/** Renders one control's chosen value the way the participant saw it in the panel. */
function describeControl(scenario: ScenarioBundle, control: ScenarioControl, state: ControlState): string {
  const value = state[control.id] ?? control.default;
  if (control.type === "select") {
    const option = control.values?.find((candidate) => candidate.value === String(value));
    return `${control.label}: ${option?.label ?? String(value)}`;
  }
  if (control.type === "toggle") {
    return `${control.label}: ${value ? "on" : "off"}`;
  }
  return `${control.label}: ${String(value)}`;
}

export function buildPlainSummary(scenario: ScenarioBundle, state: ControlState, note: string): string {
  const modelId = selectedModelId(scenario, state);
  return [
    scenario.title,
    `Selected strategy: ${getModelLabel(scenario, modelId)}`,
    // Every control, not just the strategy: the sliders are what the participant spent
    // the module moving, so a take-home that omits them omits the decision they made.
    ...scenario.controls.map((control) => `  ${describeControl(scenario, control, state)}`),
    `Learning point: ${scenario.interpretation.whyItMatters}`,
    note ? `Participant note: ${note}` : "Participant note: none"
  ].join("\n");
}
