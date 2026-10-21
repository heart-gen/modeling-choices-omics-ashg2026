export type Route =
  | { name: "home" }
  | { name: "scenarios" }
  | { name: "scenario"; scenarioId: string }
  | { name: "poll" }
  | { name: "facilitator" };

/**
 * "/" on CloudFront and in local development; the repository sub-path on the GitHub Pages
 * backup. `vite.config.ts` guarantees the trailing slash.
 */
const basePath = import.meta.env.BASE_URL;

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

/**
 * The route portion of a pathname, or null when the URL sits outside the deployment base.
 * Off-base is deliberately not treated as home: under a sub-path deployment, a bare
 * `/facilitator` belongs to a different site altogether.
 */
function stripBase(pathname: string, base: string): string | null {
  const prefix = withTrailingSlash(base);
  const path = withTrailingSlash(pathname);
  if (!path.startsWith(prefix)) return null;
  return path.slice(prefix.length).replace(/\/$/, "");
}

// `base` is a parameter so the tests can pin a deployment base rather than depend on
// whichever BASE_URL the test run happened to be built with.
export function parseLocation(location: Location, base: string = basePath): Route {
  // An explicit hash always wins. `<base>facilitator` is only the deep-link entry point,
  // so hash navigation from inside the facilitator view (say "Open module") works.
  if (normalizeHash(location.hash)) {
    return parseHash(location.hash);
  }
  if (stripBase(location.pathname, base) === "facilitator") {
    return { name: "facilitator" };
  }
  return { name: "home" };
}

function normalizeHash(hash: string): string {
  return hash.replace(/^#\/?/, "");
}

export function parseHash(hash: string): Route {
  const normalized = normalizeHash(hash);
  if (!normalized) return { name: "home" };
  if (normalized === "scenarios") return { name: "scenarios" };
  if (normalized === "poll") return { name: "poll" };
  if (normalized === "facilitator") return { name: "facilitator" };
  if (normalized.startsWith("scenario/")) {
    return { name: "scenario", scenarioId: normalized.replace("scenario/", "") };
  }
  return { name: "home" };
}

export function href(path: string): string {
  return `#/${path.replace(/^\/+/, "")}`;
}

/**
 * Must carry the deployment base. On GitHub Pages a root-absolute "/facilitator" is not
 * our own 404 — it is a different site under the same github.io host, which no SPA
 * fallback we ship can rescue.
 */
export function facilitatorHref(base: string = basePath): string {
  return `${withTrailingSlash(base)}facilitator`;
}

/**
 * The opening poll's join link as it should be read aloud or projected: origin, deployment
 * base, then the hash route, so it is right on CloudFront and on the Pages sub-path alike.
 */
export function pollJoinUrl(origin: string = window.location.origin, base: string = basePath): string {
  return `${origin}${withTrailingSlash(base)}#/poll`;
}
