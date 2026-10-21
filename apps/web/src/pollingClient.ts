export type PollOption = { id: string; label: string; count: number };
export type Poll = { id: string; question: string; responseCount: number; options: PollOption[] };

const pollingApiUrl = import.meta.env.VITE_POLLING_API_URL?.replace(/\/$/, "");

export type PollMode = "backend" | "external" | "unavailable";

/** An opening poll hosted somewhere else — Slido, Mentimeter, Poll Everywhere. */
export type ExternalPoll = {
  url: string;
  question: string;
  /** The poll tool's presenter view, for the facilitator's second window. */
  resultsUrl?: string;
  /** What to project instead of the raw URL, e.g. a join code. */
  label?: string;
};

type PollEnv = {
  VITE_POLLING_API_URL?: string;
  VITE_EXTERNAL_POLL_URL?: string;
  VITE_EXTERNAL_POLL_QUESTION?: string;
  VITE_EXTERNAL_POLL_RESULTS_URL?: string;
  VITE_EXTERNAL_POLL_LABEL?: string;
};

/** Matches backend/polling/poll.mjs, so both modes ask the room the same question. */
const defaultQuestion = "How does your team usually evaluate ancestry-related heterogeneity?";

/**
 * Only http(s) is honoured. The value is baked into the bundle and rendered as an anchor
 * on every participant screen, so a `javascript:` value would be a scripted link.
 */
function safeUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/** Pure and env-injected, so it is testable without stubbing `import.meta`. */
export function resolveExternalPoll(env: PollEnv): ExternalPoll | null {
  const url = safeUrl(env.VITE_EXTERNAL_POLL_URL);
  if (!url) return null;
  return {
    url,
    question: env.VITE_EXTERNAL_POLL_QUESTION?.trim() || defaultQuestion,
    resultsUrl: safeUrl(env.VITE_EXTERNAL_POLL_RESULTS_URL),
    label: env.VITE_EXTERNAL_POLL_LABEL?.trim() || undefined
  };
}

/**
 * Three states, in precedence order. The in-platform backend always wins, so a build
 * carrying both configurations behaves exactly as it did before external mode existed.
 *
 * `unavailable` remains the terminal state either way: the scenario platform is a hard
 * static-first commitment, and every module works whichever of the three applies.
 */
export function resolvePollMode(env: PollEnv): PollMode {
  if (env.VITE_POLLING_API_URL?.trim()) return "backend";
  if (resolveExternalPoll(env)) return "external";
  return "unavailable";
}

/**
 * Non-null whenever the variable is set, independent of mode, so it doubles as the
 * degraded surface if a configured backend never answers rather than a dead end.
 */
export const externalPoll = resolveExternalPoll(import.meta.env);

export const pollMode = resolvePollMode(import.meta.env);

/** Retained: "a backend is configured" is what the fetch paths below actually gate on. */
export const pollingConfigured = pollMode === "backend";

/** The opening-segment poll. Module prediction polls pass their own id. */
export const practicePollId = "analytic-practice";

function pollPath(pollId: string): string {
  return `/api/polls/${encodeURIComponent(pollId)}`;
}

/** Aborts rather than leaving a participant staring at a spinner on a bad venue network. */
const requestTimeoutMs = 3000;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${pollingApiUrl}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Polling request failed: ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchPoll(pollId: string = practicePollId): Promise<Poll> {
  return requestJson<Poll>(pollPath(pollId));
}

/**
 * Behind CloudFront, OAC signs requests to the Lambda Function URL origin, but Lambda does
 * not accept unsigned payloads: a POST without its body hash in `x-amz-content-sha256` is
 * a 403. The GET paths are unaffected, which is why this fails only when someone votes.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function submitResponse(optionId: string, pollId: string = practicePollId): Promise<Poll> {
  const body = JSON.stringify({ optionId });
  const headers: Record<string, string> = { "content-type": "application/json" };
  // crypto.subtle exists only in secure contexts. CloudFront is HTTPS; a plain-http LAN dev
  // server has no OAC in front of it and needs no hash.
  if (globalThis.crypto?.subtle) headers["x-amz-content-sha256"] = await sha256Hex(body);
  return requestJson<Poll>(`${pollPath(pollId)}/responses`, { method: "POST", headers, body });
}
