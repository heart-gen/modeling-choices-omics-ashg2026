import type { ScenarioBundle } from "./types";

/**
 * Colour is an identity claim on these charts: an ancestry group keeps one colour on every
 * chart in the platform, and nothing that is *not* an ancestry group may borrow one. The
 * first chart palette did exactly that — "Pooled", "Fixed-effect summary", and "Global
 * ancestry PCs" all fell back to the first palette entry, which is the African-ancestry
 * blue, so the pooled estimate read as the African-ancestry estimate.
 */

/** Mirrors GROUP_COLORS in analysis/reference_data.py, for a group id a bundle does not declare. */
export const groupPalette: Record<string, string> = {
  afr: "#2563eb",
  eur: "#059669",
  amr: "#b45309",
  eas: "#7c3aed",
  sas: "#db2777",
  mid: "#475569"
};

/**
 * Series that are not an ancestry group: analysis strategies, summary rows, model
 * families, compute platforms. Ink first, because a pooled or summary estimate is
 * conventionally drawn neutral; then cyan and magenta, the two hues clear of every group
 * colour above and of the status pair below. Checked with the dataviz palette validator
 * against the four charted group hues; the weakest pair (cyan vs European green) is still
 * labelled and shaped differently wherever both appear.
 */
export const strategyPalette = ["#1f2937", "#0891b2", "#c026d3"];

/** Line dash per strategy, so three model curves are not told apart by hue alone. */
export const strategyLineTypes: Array<"solid" | "dashed" | "dotted"> = ["solid", "dashed", "dotted"];

/** Reserved for verdicts (detected / feasible), never for a series identity. */
export const statusColors = { pass: "#047857", fail: "#b91c1c" };

export type ColorScale = {
  /** The colour for a series or row identity: a group id, a group label, or a strategy label. */
  color: (name: string) => string;
  /** The dash style for a non-group series; groups are always solid. */
  lineType: (name: string) => "solid" | "dashed" | "dotted";
  /** True when the name resolves to an ancestry group. */
  isGroup: (name: string) => boolean;
};

/**
 * Build the scale from the rows in *bundle* order, then look names up in any order: a
 * forest plot drawn bottom-to-top must not hand its summaries different colours from the
 * same rows drawn top-to-bottom. Non-group names take strategy colours in order of first
 * appearance in `names`; a name not in `names` is appended on first lookup.
 */
export function makeColorScale(scenario: Pick<ScenarioBundle, "ancestryGroups">, names: string[]): ColorScale {
  const groups = new Map<string, string>();
  for (const [id, color] of Object.entries(groupPalette)) groups.set(id, color);
  for (const group of scenario.ancestryGroups ?? []) {
    groups.set(group.id.toLowerCase(), group.color);
    groups.set(group.label.toLowerCase(), group.color);
  }

  const strategies = new Map<string, number>();
  const register = (name: string) => {
    const key = name.toLowerCase();
    if (groups.has(key) || strategies.has(key)) return;
    strategies.set(key, strategies.size);
  };
  names.forEach(register);

  const strategyIndex = (name: string) => {
    register(name);
    return strategies.get(name.toLowerCase()) ?? 0;
  };

  return {
    isGroup: (name) => groups.has(name.toLowerCase()),
    color: (name) =>
      groups.get(name.toLowerCase()) ?? strategyPalette[strategyIndex(name) % strategyPalette.length],
    lineType: (name) =>
      groups.has(name.toLowerCase()) ? "solid" : strategyLineTypes[strategyIndex(name) % strategyLineTypes.length]
  };
}
