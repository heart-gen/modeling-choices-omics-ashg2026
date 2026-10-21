import { describe, expect, it } from "vitest";
import { resolveExternalPoll, resolvePollMode, sha256Hex } from "./pollingClient";

// Lambda compares this against the body CloudFront forwards; any encoding drift is a 403
// on every vote in the room.
describe("sha256Hex", () => {
  it("produces the lowercase hex digest Lambda expects in x-amz-content-sha256", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

const backendUrl = "https://d111111abcdef8.cloudfront.net";
const externalUrl = "https://app.sli.do/event/EXAMPLE";

describe("resolvePollMode", () => {
  // The precedence that keeps the CloudFront build unchanged if the backup variables are
  // ever left set on it.
  it("prefers the in-platform backend when both are configured", () => {
    expect(
      resolvePollMode({ VITE_POLLING_API_URL: backendUrl, VITE_EXTERNAL_POLL_URL: externalUrl })
    ).toBe("backend");
  });

  it("falls back to the external tool when only it is configured", () => {
    expect(resolvePollMode({ VITE_EXTERNAL_POLL_URL: externalUrl })).toBe("external");
  });

  it("reports unavailable with neither configured", () => {
    expect(resolvePollMode({})).toBe("unavailable");
    expect(resolvePollMode({ VITE_POLLING_API_URL: "  " })).toBe("unavailable");
  });
});

describe("resolveExternalPoll", () => {
  it("defaults the question to the backend poll's wording", () => {
    expect(resolveExternalPoll({ VITE_EXTERNAL_POLL_URL: externalUrl })?.question).toBe(
      "How does your team usually evaluate ancestry-related heterogeneity?"
    );
  });

  it("carries an overridden question, results view, and projection label", () => {
    expect(
      resolveExternalPoll({
        VITE_EXTERNAL_POLL_URL: externalUrl,
        VITE_EXTERNAL_POLL_QUESTION: "Which ancestry model do you reach for first?",
        VITE_EXTERNAL_POLL_RESULTS_URL: "https://app.sli.do/event/EXAMPLE/present",
        VITE_EXTERNAL_POLL_LABEL: "slido.com  #2026"
      })
    ).toEqual({
      url: externalUrl,
      question: "Which ancestry model do you reach for first?",
      resultsUrl: "https://app.sli.do/event/EXAMPLE/present",
      label: "slido.com  #2026"
    });
  });

  // The value is baked into the bundle and rendered as an anchor on participant screens.
  it("rejects a non-http URL rather than rendering a scripted link", () => {
    expect(resolveExternalPoll({ VITE_EXTERNAL_POLL_URL: "javascript:alert(1)" })).toBeNull();
    expect(resolveExternalPoll({ VITE_EXTERNAL_POLL_URL: "" })).toBeNull();
  });

  it("drops a bad results URL without discarding a good join URL", () => {
    const poll = resolveExternalPoll({
      VITE_EXTERNAL_POLL_URL: externalUrl,
      VITE_EXTERNAL_POLL_RESULTS_URL: "javascript:alert(1)"
    });
    expect(poll?.url).toBe(externalUrl);
    expect(poll?.resultsUrl).toBeUndefined();
  });
});
