import { describe, expect, it } from "vitest";
import { facilitatorHref, parseHash, parseLocation, pollJoinUrl } from "./router";

function at(pathname: string, hash = ""): Location {
  return { pathname, hash } as Location;
}

/** What `actions/configure-pages` produces for this repository, plus the trailing slash. */
const pagesBase = "/modeling-choices-omics-ashg2026/";

describe("parseHash", () => {
  it("maps an empty hash to home", () => {
    expect(parseHash("")).toEqual({ name: "home" });
    expect(parseHash("#/")).toEqual({ name: "home" });
  });

  it("maps known routes", () => {
    expect(parseHash("#/scenarios")).toEqual({ name: "scenarios" });
    expect(parseHash("#/poll")).toEqual({ name: "poll" });
    expect(parseHash("#/facilitator")).toEqual({ name: "facilitator" });
  });

  it("extracts a scenario id", () => {
    expect(parseHash("#/scenario/pooled-vs-stratified")).toEqual({
      name: "scenario",
      scenarioId: "pooled-vs-stratified"
    });
  });

  it("falls back to home for unknown routes", () => {
    expect(parseHash("#/nope")).toEqual({ name: "home" });
  });
});

describe("parseLocation", () => {
  it("treats /facilitator as the deep-link entry point", () => {
    expect(parseLocation(at("/facilitator"))).toEqual({ name: "facilitator" });
  });

  // Regression guard: parseLocation used to return `facilitator` on pathname alone,
  // before reading the hash, so every link in the facilitator run sheet was inert.
  it("lets hash navigation win while on the /facilitator path", () => {
    expect(parseLocation(at("/facilitator", "#/scenario/within-vs-meta"))).toEqual({
      name: "scenario",
      scenarioId: "within-vs-meta"
    });
    expect(parseLocation(at("/facilitator", "#/scenarios"))).toEqual({ name: "scenarios" });
  });

  it("routes by hash from the site root", () => {
    expect(parseLocation(at("/"))).toEqual({ name: "home" });
    expect(parseLocation(at("/", "#/facilitator"))).toEqual({ name: "facilitator" });
    expect(parseLocation(at("/", "#/scenarios"))).toEqual({ name: "scenarios" });
  });

  it("finds the entry point under a deployment sub-path", () => {
    expect(parseLocation(at(`${pagesBase}facilitator`), pagesBase)).toEqual({ name: "facilitator" });
    expect(parseLocation(at(pagesBase), pagesBase)).toEqual({ name: "home" });
  });

  it("still lets hash navigation win under a sub-path", () => {
    expect(parseLocation(at(`${pagesBase}facilitator`, "#/scenarios"), pagesBase)).toEqual({
      name: "scenarios"
    });
  });

  // On GitHub Pages this URL is a different site under the same host, not our 404.
  it("ignores a root-absolute /facilitator when the app is served from a sub-path", () => {
    expect(parseLocation(at("/facilitator"), pagesBase)).toEqual({ name: "home" });
  });
});

describe("facilitatorHref", () => {
  it("is root-absolute on the CloudFront deployment", () => {
    expect(facilitatorHref("/")).toBe("/facilitator");
  });

  it("carries the deployment base on GitHub Pages", () => {
    expect(facilitatorHref(pagesBase)).toBe(`${pagesBase}facilitator`);
  });

  // configure-pages emits `base_path` without one; vite.config.ts normalises it, and this
  // pins the behaviour in case that ever regresses.
  it("tolerates a base missing its trailing slash", () => {
    expect(facilitatorHref("/modeling-choices-omics-ashg2026")).toBe(`${pagesBase}facilitator`);
  });
});

describe("pollJoinUrl", () => {
  it("carries the origin and the deployment base ahead of the hash route", () => {
    expect(pollJoinUrl("https://example.cloudfront.net", "/")).toBe("https://example.cloudfront.net/#/poll");
    expect(pollJoinUrl("https://heart-gen.github.io", pagesBase)).toBe(
      "https://heart-gen.github.io/modeling-choices-omics-ashg2026/#/poll"
    );
  });
});
