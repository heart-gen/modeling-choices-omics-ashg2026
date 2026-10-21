/**
 * 200 concurrent writes against the polling contract.
 *
 * By default it spawns the local service, which is what CI runs. Point it at the deployed
 * API to substantiate the abstract's 75-150 concurrent-user claim, because that claim is
 * about the weakest deployed component and not about a process on a laptop:
 *
 *   POLLING_BASE_URL=https://dxxxx.cloudfront.net node tests/polling-load.mjs
 *
 * Against a deployed target it does not reset counts first, so it asserts on the delta.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const remoteBase = process.env.POLLING_BASE_URL?.replace(/\/$/, "");
const port = 8800 + (process.pid % 500);
const base = remoteBase ?? `http://127.0.0.1:${port}`;
const writes = Number(process.env.POLLING_LOAD_WRITES ?? 200);

async function request(method, path, body) {
  const payload = body ? JSON.stringify(body) : undefined;
  const response = await fetch(`${base}${path}`, {
    method,
    // Behind CloudFront's OAC, Lambda rejects a POST that does not carry its body hash,
    // exactly as it would a participant's vote from the app.
    headers: payload
      ? {
          "content-type": "application/json",
          "x-amz-content-sha256": createHash("sha256").update(payload).digest("hex")
        }
      : undefined,
    body: payload
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${parsed.error}`);
  return parsed;
}

async function waitUntilReady() {
  // /health is a service route, not an /api/* route, so CloudFront does not map it to
  // Lambda — probing it against a deployment reaches S3 and never parses as JSON, and the
  // load test then reports a healthy backend as "did not become ready". The poll snapshot
  // is the readiness signal that exists on both transports.
  const probe = remoteBase ? "/api/polls/analytic-practice" : "/health";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await request("GET", probe);
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error("Polling service did not become ready");
}

const server = remoteBase
  ? undefined
  : spawn(process.execPath, ["backend/polling/server.mjs"], {
      cwd: root,
      env: { ...process.env, POLLING_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });

try {
  await waitUntilReady();
  const before = await request("GET", `/api/polls/analytic-practice`);
  const started = performance.now();
  await Promise.all(Array.from({ length: writes }, (_, index) =>
    request("POST", "/api/polls/analytic-practice/responses", {
      optionId: before.options[index % before.options.length].id
    })
  ));
  const after = await request("GET", "/api/polls/analytic-practice");
  const recorded = after.responseCount - before.responseCount;
  if (recorded !== writes) {
    throw new Error(`Expected ${writes} new responses, recorded ${recorded}`);
  }
  const elapsed = performance.now() - started;
  console.log(`Polling load check passed against ${base}: ${writes} concurrent writes in ${elapsed.toFixed(0)} ms.`);
} finally {
  server?.kill("SIGTERM");
}
