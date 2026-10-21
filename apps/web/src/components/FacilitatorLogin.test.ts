import { describe, expect, it } from "vitest";
import { facilitatorGateEnabled } from "./FacilitatorLogin";

describe("facilitatorGateEnabled", () => {
  it("gates a live session that sets both credentials", () => {
    expect(facilitatorGateEnabled("facilitator", "secret")).toBe(true);
  });

  // The open-access build sets neither, and must open the run sheet rather than lock it.
  it("leaves the view open when either credential is unset or blank", () => {
    expect(facilitatorGateEnabled(undefined, undefined)).toBe(false);
    expect(facilitatorGateEnabled("facilitator", undefined)).toBe(false);
    expect(facilitatorGateEnabled(undefined, "secret")).toBe(false);
    expect(facilitatorGateEnabled("  ", "secret")).toBe(false);
    expect(facilitatorGateEnabled("facilitator", "")).toBe(false);
  });
});
