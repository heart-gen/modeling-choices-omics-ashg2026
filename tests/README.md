# Test Strategy

Project-level tests are split across:

- `scripts/validate-scenarios.mjs` for scenario bundle validation.
- `apps/web/src/**/*.test.ts` for unit tests.
- `apps/web/e2e/*.spec.ts` for workshop flow checks.

The default e2e run uses Chromium for fast prototype verification:

```bash
npm run test:e2e
```

Run the broader browser matrix on a machine with the required Playwright system dependencies:

```bash
E2E_ALL_BROWSERS=1 npm run test:e2e
```

Before the workshop release, run the full browser matrix manually or in CI and perform a room-network rehearsal with the production URL plus static backup figures.
