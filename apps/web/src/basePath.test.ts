import { describe, expect, it } from "vitest";
import { normalizeBase } from "./basePath";

describe("normalizeBase", () => {
  it("defaults to the domain root for CloudFront and local development", () => {
    expect(normalizeBase(undefined)).toBe("/");
    expect(normalizeBase("")).toBe("/");
    expect(normalizeBase("  ")).toBe("/");
    expect(normalizeBase("/")).toBe("/");
  });

  // The whole point: this is the shape `actions/configure-pages` emits, and the shape that
  // otherwise makes dataLoader fetch "/modeling-choices-omics-ashg2026data/...".
  it("appends the trailing slash BASE_URL consumers depend on", () => {
    expect(normalizeBase("/modeling-choices-omics-ashg2026")).toBe("/modeling-choices-omics-ashg2026/");
  });

  it("leaves an already-normalised base alone", () => {
    expect(normalizeBase("/modeling-choices-omics-ashg2026/")).toBe("/modeling-choices-omics-ashg2026/");
  });

  it("adds a leading slash when one is missing", () => {
    expect(normalizeBase("modeling-choices-omics-ashg2026")).toBe("/modeling-choices-omics-ashg2026/");
  });
});
