import { createPollingHandler, maxBodyBytes } from "./handler.mjs";
import { DynamoPollStore } from "./dynamoStore.mjs";

// Built once per container so warm invocations reuse the DynamoDB connection pool.
const handle = createPollingHandler({
  store: new DynamoPollStore(),
  // Behind CloudFront the API is same-origin with the static site, so CORS never fires.
  // The variable exists for the case where the API is fronted separately.
  allowedOrigin: process.env.POLLING_ALLOWED_ORIGIN ?? "*"
});

/** Adapter for Lambda Function URL payload format 2.0. */
export async function handler(event) {
  const method = event?.requestContext?.http?.method ?? "GET";
  const path = event?.rawPath ?? "/";
  const origin = event?.headers?.origin ?? event?.headers?.Origin;

  let body = event?.body;
  if (body && event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf8");
  }
  if (typeof body === "string" && Buffer.byteLength(body) > maxBodyBytes) {
    return {
      statusCode: 413,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      body: JSON.stringify({ error: "Request body is too large" })
    };
  }

  const result = await handle({ method, path, origin, body });
  return {
    statusCode: result.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...result.headers
    },
    body: result.body === undefined ? "" : JSON.stringify(result.body)
  };
}
