import { createServer } from "node:http";
import { createPollingHandler, maxBodyBytes } from "./handler.mjs";
import { MemoryPollStore } from "./memoryStore.mjs";

const port = Number(process.env.POLLING_PORT ?? 8787);
// Loopback by default so a development run is not silently exposed. Set 0.0.0.0 to serve
// a room over the local network; a deployed session uses the Lambda adapter instead.
const host = process.env.POLLING_HOST ?? "127.0.0.1";
const allowedOrigin = process.env.POLLING_ALLOWED_ORIGIN ?? "http://localhost:5173";

const handle = createPollingHandler({ store: new MemoryPollStore(), allowedOrigin });

function send(response, { status, headers, body }) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  const path = new URL(request.url, `http://${request.headers.host ?? "localhost"}`).pathname;
  let body;
  if (request.method === "POST") {
    try {
      body = await readBody(request);
    } catch (error) {
      send(response, { status: 413, headers: {}, body: { error: error.message } });
      return;
    }
  }
  send(response, await handle({
    method: request.method,
    path,
    origin: request.headers.origin,
    body
  }));
});

server.listen(port, host, () => {
  console.log(`Polling service listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
