# AWS S3 + CloudFront architecture

Operational instructions live in [`deploy/README.md`](./README.md). This file records the
shape of the deployment and why it is built this way.

## Topology

```
                    ┌──────────────────────────────┐
  participants ───▶ │  CloudFront distribution      │
                    │                               │
                    │  default  ─────▶ S3 (OAC)     │  static SPA + scenario bundles
                    │  /api/*   ─────▶ Lambda (OAC) │  aggregate poll API
                    │  /facilitator ─▶ CF Function  │  Basic auth at the edge
                    └──────────────────────────────┘
                                            │
                                            ▼
                                   DynamoDB (atomic counters)
```

Defined in `deploy/infra/workshop-stack.yaml`; the edge function's readable source is
`deploy/infra/facilitator-auth.js`.

## Why this shape

**Same origin.** Putting the poll API on `/api/*` of the same distribution means the
browser makes no cross-origin requests: no CORS preflight to misconfigure, one hostname to
allow through venue networking, and one URL on the slide. The service still implements
CORS for local development, where the app is on `:5173` and the service on `:8787`.

**Private origins.** The S3 bucket blocks all public access and is reachable only through
CloudFront's Origin Access Control. The Lambda Function URL is `AWS_IAM`-authenticated and
signed by OAC, so it cannot be invoked directly — the distribution is the only front door.

Two OAC requirements are easy to miss because both fail as a bare 403. CloudFront needs
**both** `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` on the function. And Lambda
does not accept unsigned payloads, so every POST must carry the hex SHA-256 of its body in
`x-amz-content-sha256` — `submitResponse` and the load test both send it. Without the
header, GETs work and every vote is rejected, so the deploy smoke check posts a signed
request with an unknown option id and expects the handler's 400.

**Separable failure.** The static platform is the workshop; the poll is an accessory. With
the API unreachable, `PollingPanel` and `PollResultsPanel` both report polling unavailable
and all six modules continue to work. This is a hard design commitment, not a nicety —
see rule 2 in `CONTRIBUTING.md`.

**Atomic counts.** Votes are a single DynamoDB `ADD`, applied server-side. A hundred and
fifty people answering the opening question inside ten seconds is exactly the burst a
read-modify-write store undercounts, and an undercounted poll is one the facilitator
narrates wrongly to the room.

**Retained data resources.** The bucket and table carry `DeletionPolicy: Retain`, so a
stack mistake during conference week cannot delete the deployed build or the session's
responses.

## Cache policy

| Path | Cache-Control | Rationale |
| --- | --- | --- |
| `assets/*` | `max-age=31536000, immutable` | Vite emits content-hashed filenames |
| `data/scenarios/*.json` | `max-age=86400` | raised for the frozen workshop release tag |
| `index.html` | `no-cache` | so a rollback mid-session propagates immediately |
| `/api/*` | `CachingDisabled` | a cached vote count is a wrong vote count |

## Facilitator access

Two independent, deliberately lightweight checks:

1. The in-app gate (`FacilitatorLogin.tsx`) compares against build-time environment
   variables and **fails closed** when they are unset.
2. The CloudFront Function returns 401 for `/facilitator*` without Basic credentials.

The two read their credential from different places — the edge function from the stack's
`FacilitatorBasicAuth` parameter, the app from build-time secrets — so they can drift apart
silently, and a facilitator who clears the browser prompt is then refused by the form. The deploy
smoke check is what holds them together: it requests `/facilitator` with the pair compiled into
the build and requires a 200.

Neither is a security boundary — static JavaScript is readable, and the app's own hash
routes are not visible to CloudFront at all, which is why `/facilitator` is a real
pathname. There is nothing sensitive behind them: all scenario data is synthetic or
aggregate, and the poll records counts only.

## Resilience

Keep the release tag for the exact workshop build, and keep `data/figures-backup/*.png`
current (`npm run export:figures`) so the session can continue from static figures if
venue networking fails.
