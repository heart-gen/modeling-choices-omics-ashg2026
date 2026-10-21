/**
 * Deployment base path handling, shared by `vite.config.ts` and its test.
 *
 * This lives in its own module because it is load-bearing and fails silently. Vite
 * guarantees only a *leading* slash on `base` and exposes it verbatim as
 * `import.meta.env.BASE_URL`; both `dataLoader.ts` and `router.ts` consume that value as a
 * bare prefix. So `base: "/repo"` makes the app fetch "/repodata/scenarios/index.json" —
 * every module failing to load, from a build that exits zero and looks correct, because
 * Vite still emits asset URLs properly.
 *
 * `actions/configure-pages` emits its `base_path` without a trailing slash ("/my-repo"),
 * which is exactly the input that triggers it.
 */
export function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value || value === "/") return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
