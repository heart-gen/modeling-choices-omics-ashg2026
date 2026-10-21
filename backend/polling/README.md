# Aggregate polling service

Backs the workshop's opening-segment poll and the facilitator's synthesis view. It is
deliberately separate from the static scenario application: **with this service absent or
unreachable, both poll panels report themselves unavailable and all six scenario modules
continue to work unchanged.** That is a hard design commitment, not a fallback nicety.

The service stores aggregate option counts only — no names, accounts, IP addresses, free
text, or genetic data.

## Contract

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/health` | `{ status: "ok" }` |
| `GET` | `/api/polls/<pollId>` | poll snapshot with per-option counts |
| `POST` | `/api/polls/<pollId>/responses` | `{ optionId }` → updated snapshot (202) |

`poll.mjs` defines every accepted poll: the opening-segment `analytic-practice` poll, and
one prediction poll per module that opens with a committed prediction (currently
`predict-global-vs-local-ancestry`). An unknown poll id is a 404, and an option id that
does not belong to that poll is a 400. A module's `prediction` block must match its poll
here exactly; `npm run validate:data` fails if they drift apart.

## Layout

| File | Role |
| --- | --- |
| `poll.mjs` | the poll definition and snapshot shape, shared by every store and runtime |
| `handler.mjs` | transport-agnostic routing, CORS, and body limits |
| `memoryStore.mjs` | single-process counts for local development and the load check |
| `dynamoStore.mjs` | DynamoDB atomic counters for a deployed session |
| `server.mjs` | local Node HTTP server (`npm run polling:dev`) |
| `lambda.mjs` | AWS Lambda Function URL adapter over the same handler |

Splitting the handler from the transport is what keeps the contract from drifting between
what we develop against and what we deploy.

## Local development

```bash
npm run polling:dev                            # :8787, bound to 127.0.0.1
VITE_POLLING_API_URL=http://127.0.0.1:8787 npm run dev
```

Environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `POLLING_PORT` | `8787` | |
| `POLLING_HOST` | `127.0.0.1` | set `0.0.0.0` to serve a local network |
| `POLLING_ALLOWED_ORIGIN` | `http://localhost:5173` | `*` to allow any origin |
| `POLLING_TABLE_NAME` | — | required by the DynamoDB store |

## Deployed

`deploy/infra/workshop-stack.yaml` puts `lambda.mjs` behind the same CloudFront
distribution as the static site, on `/api/*`. Two consequences worth knowing:

- **Same origin**, so the browser makes no cross-origin request and CORS never fires in
  production. The CORS support exists for local development only.
- **Counts are atomic.** A vote is a single DynamoDB `ADD`, applied server-side. A hundred
  and fifty people answering inside ten seconds is exactly the burst a read-modify-write
  store undercounts, and an undercounted poll is one the facilitator narrates wrongly.

## Load testing

```bash
npm run test:polling-load                                  # local, spawns the service
POLLING_BASE_URL=https://YOUR_DIST.cloudfront.net npm run test:polling-load
```

The abstract's 75–150 concurrent-user claim is about the weakest *deployed* component, so
run it against the deployment before the session, not only against a laptop process.

## Resetting between sessions

```bash
aws sso login --profile ashg2026
AWS_PROFILE=ashg2026 POLLING_TABLE_NAME=<table> npm run polling:reset
```

This is an operator script rather than an HTTP endpoint on purpose. The facilitator gate
is a convenience, not a security boundary, so a reachable reset route would let any
participant wipe the room's answers mid-session.
