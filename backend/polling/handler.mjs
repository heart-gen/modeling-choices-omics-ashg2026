import { getPoll } from "./poll.mjs";

/** `/api/polls/<pollId>` reads a snapshot; `/api/polls/<pollId>/responses` records a vote. */
const pollRoute = /^\/api\/polls\/([a-z0-9-]+)(\/responses)?$/;

/** Bodies are one short option id; anything larger is not a participant vote. */
export const maxBodyBytes = 2048;

/**
 * Transport-agnostic routing, shared by the local http server and the Lambda adapter, so
 * the contract cannot drift between what we develop against and what we deploy.
 *
 * Takes and returns plain objects: { method, path, origin, body } -> { status, headers, body }.
 */
export function createPollingHandler({ store, allowedOrigin = "http://localhost:5173" }) {
  function resolveOrigin(origin) {
    if (!origin) return undefined;
    if (allowedOrigin === "*" || origin === allowedOrigin) return origin;
    return null;
  }

  function corsHeaders(origin) {
    return origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
  }

  return async function handle({ method, path, origin, body }) {
    const resolvedOrigin = resolveOrigin(origin);
    if (resolvedOrigin === null) {
      return { status: 403, headers: {}, body: { error: "Origin is not allowed" } };
    }
    const headers = corsHeaders(resolvedOrigin);

    if (method === "OPTIONS") {
      return {
        status: 204,
        headers: {
          "access-control-allow-origin": resolvedOrigin ?? allowedOrigin,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          // The client sends its body hash for CloudFront's OAC; allow it for local dev too.
          "access-control-allow-headers": "content-type, x-amz-content-sha256",
          vary: "Origin"
        },
        body: undefined
      };
    }

    if (method === "GET" && path === "/health") {
      return { status: 200, headers, body: { status: "ok" } };
    }

    const match = pollRoute.exec(path);
    if (!match) {
      return { status: 404, headers, body: { error: "Not found" } };
    }
    const poll = getPoll(match[1]);
    if (!poll) {
      return { status: 404, headers, body: { error: "Unknown poll" } };
    }
    const isResponses = Boolean(match[2]);

    if (method === "GET" && !isResponses) {
      return { status: 200, headers, body: await store.snapshot(poll.id) };
    }

    if (method === "POST" && isResponses) {
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        return { status: 202, headers, body: await store.respond(poll.id, parsed?.optionId) };
      } catch (error) {
        return {
          status: 400,
          headers,
          body: { error: error instanceof Error ? error.message : "Invalid response" }
        };
      }
    }

    return { status: 404, headers, body: { error: "Not found" } };
  };
}
