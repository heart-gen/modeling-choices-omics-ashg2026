import { describe, expect, it } from "vitest";
import { groupPalette, makeColorScale, statusColors, strategyPalette } from "./chartColors";

const scenario = {
  ancestryGroups: [
    { id: "afr", label: "African ancestry", color: "#2563eb", n: 100 },
    { id: "eur", label: "European ancestry", color: "#059669", n: 100 },
    { id: "amr", label: "Admixed American ancestry", color: "#b45309", n: 100 }
  ]
};
const groupColors = new Set(Object.values(groupPalette));

describe("makeColorScale", () => {
  it("never gives a strategy an ancestry group's colour", () => {
    // The regression: "Pooled" used to take palette[0], the African-ancestry blue.
    const scale = makeColorScale(scenario, ["Pooled", "African ancestry", "European ancestry"]);
    expect(scale.color("Pooled")).toBe(strategyPalette[0]);
    expect(groupColors.has(scale.color("Pooled"))).toBe(false);
    expect(scale.color("African ancestry")).toBe("#2563eb");
    expect(scale.color("afr")).toBe("#2563eb");
  });

  it("assigns strategy colours by first appearance, independent of lookup order", () => {
    const rows = ["African ancestry", "European ancestry", "Fixed-effect summary", "Random-effects summary"];
    const scale = makeColorScale(scenario, rows);
    const reversed = makeColorScale(scenario, rows);
    for (const name of [...rows].reverse()) {
      expect(reversed.color(name)).toBe(scale.color(name));
    }
    expect(scale.color("Fixed-effect summary")).toBe(strategyPalette[0]);
    expect(scale.color("Random-effects summary")).toBe(strategyPalette[1]);
  });

  it("falls back to the shared group palette for an undeclared group id", () => {
    const scale = makeColorScale({ ancestryGroups: [] }, ["eas"]);
    expect(scale.color("eas")).toBe(groupPalette.eas);
    expect(scale.isGroup("eas")).toBe(true);
    expect(scale.isGroup("Global ancestry PCs")).toBe(false);
  });

  it("keeps strategy hues distinct from each other and from the status colours", () => {
    const all = new Set([...strategyPalette, statusColors.pass, statusColors.fail]);
    expect(all.size).toBe(strategyPalette.length + 2);
    expect(strategyPalette.some((hex) => groupColors.has(hex))).toBe(false);
  });
});
