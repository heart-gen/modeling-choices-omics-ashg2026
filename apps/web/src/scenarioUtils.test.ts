import { describe, expect, it } from "vitest";
import {
  buildPlainSummary,
  defaultControlState,
  formatPValue,
  resolveVizSeries,
  selectedModelId
} from "./scenarioUtils";
import type { ScenarioBundle } from "./types";

const scenario = {
  title: "Example",
  controls: [
    {
      id: "modelId",
      label: "Model",
      type: "select",
      default: "pooled",
      values: [{ value: "pooled", label: "Pooled" }]
    },
    {
      id: "sampleSize",
      label: "Sample size",
      type: "slider",
      default: 250,
      min: 250,
      max: 500,
      step: 250
    },
    {
      id: "effect",
      label: "Effect",
      type: "slider",
      default: 0,
      min: -0.08,
      max: 0.08,
      step: 0.04
    }
  ],
  interpretation: {
    whyItMatters: "Averages can hide heterogeneity."
  },
  vizSummaries: {
    flat: [{ value: 1 }],
    grid: {
      byControl: "sampleSize",
      values: {
        "250": [{ value: 2 }],
        "500": [{ value: 3 }]
      }
    },
    multi: {
      byControls: ["sampleSize", "effect"],
      values: {
        "250|0": [{ value: 4 }],
        "500|-0.04": [{ value: 5 }]
      }
    }
  }
} as unknown as ScenarioBundle;

describe("scenario utilities", () => {
  it("creates default control state", () => {
    expect(defaultControlState(scenario)).toEqual({ modelId: "pooled", sampleSize: 250, effect: 0 });
  });

  it("selects fallback model id", () => {
    expect(selectedModelId(scenario, {})).toBe("pooled");
  });

  it("formats small p values", () => {
    expect(formatPValue(0.00000002)).toContain("e");
    expect(formatPValue(0.02)).toBe("0.020");
  });

  it("builds take-home summary text", () => {
    expect(buildPlainSummary(scenario, { modelId: "pooled" }, "Use stratified plots.")).toContain("Use stratified plots.");
  });

  // Guard for the take-home export: it must record what the participant chose, including
  // slider positions, not the scenario defaults.
  it("records every control's chosen value in the take-home summary", () => {
    const text = buildPlainSummary(scenario, { modelId: "pooled", sampleSize: 500 }, "");
    expect(text).toContain("Sample size: 500");
    expect(text).toContain("Model: Pooled");
    expect(text).toContain("Participant note: none");
  });

  it("resolves a flat visualization series", () => {
    expect(resolveVizSeries(scenario, "flat", {})).toEqual([{ value: 1 }]);
  });

  it("resolves numeric control values by their string key", () => {
    expect(resolveVizSeries(scenario, "grid", { sampleSize: 500 })).toEqual([{ value: 3 }]);
  });

  it("falls back to the control default when saved state is stale", () => {
    expect(resolveVizSeries(scenario, "grid", { sampleSize: 999 })).toEqual([{ value: 2 }]);
  });

  it("resolves a grid keyed by several controls", () => {
    expect(resolveVizSeries(scenario, "multi", { sampleSize: 500, effect: -0.04 })).toEqual([{ value: 5 }]);
  });

  // Range-input step arithmetic can land on -0.039999999999999994 while the generator
  // wrote "-0.04"; an exact-string miss would silently snap every chart to the defaults.
  it("normalises floating-point slider values before building a multi-control key", () => {
    expect(resolveVizSeries(scenario, "multi", { sampleSize: 500, effect: -0.12 + 0.08 })).toEqual([{ value: 5 }]);
  });

  it("falls back to the defaults when a multi-control combination is missing", () => {
    expect(resolveVizSeries(scenario, "multi", { sampleSize: 500, effect: 0.08 })).toEqual([{ value: 4 }]);
  });
});
