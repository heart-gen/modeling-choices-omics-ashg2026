# Modeling Choices in Omics

Browser-based, no-code educational platform for the ASHG 2026 workshop **Modeling Choices in Omics: Implications for Health Disparities in Human Genetics**.

**Try it:** <https://heart-gen.github.io/modeling-choices-omics-ashg2026/> — all six modules, plus the [facilitator run sheet](https://heart-gen.github.io/modeling-choices-omics-ashg2026/#/facilitator) with timing cues and reveal notes.

**Slides:** the deck as presented at the workshop, in [`slides/`](./slides/) ([PDF](./slides/ASHG2026-modeling-choices.pdf) · [PowerPoint](./slides/ASHG2026-modeling-choices.pptx)).

The platform is a guided decision lab. Participants explore synthetic, precomputed genomics and multi-omics scenarios through controls, visualizations, interpretation prompts, and facilitator-led discussion. It does not require accounts, data upload, local installation, command-line use, or live statistical computation during the workshop.

## Quick Start

```bash
npm install
npm run dev
```

The app runs from `apps/web`. Scenario bundles live in `data/scenarios` and are copied into `apps/web/public/data/scenarios` before development and build.

Requires Node >= 22.12. For the Python generator, `python3 -m pip install -r analysis/requirements.txt`.

## Useful Commands

```bash
npm run lint              # eslint across app, backend, and tooling
npm run validate:data     # schema, chart keys, provenance, log-axis safety
npm run test              # vitest
npm run build             # tsc -b && vite build
npm run test:e2e          # playwright: workshop flow, responsive, keyboard, take-home
npm run audit:controls    # opens every module, confirms every control changes pixels
npm run test:polling-load # 200 concurrent writes; POLLING_BASE_URL to hit a deployment
npm run polling:dev       # optional local polling service on :8787
npm run export:figures    # refresh data/figures-backup/*.png
npm run export:slides     # 16 projector slides (join, agenda, commit/reveal per module, synthesis)
```

## Repository Layout

```text
apps/web/              React + Vite workshop application
analysis/              seeded Python generator — the source of truth for every number
data/scenarios/        generated synthetic runtime bundles (committed)
data/figures-backup/   exported module figures for a network-failure fallback
backend/polling/       optional aggregate-only polling service (local + Lambda)
deploy/                CloudFormation stack and deployment runbook
docs/                  data schema; docs/archive/ holds the build-time reviews (abstract, deck)
slides/                the workshop deck as presented (PDF and PowerPoint)
workshop/              facilitator guide, rehearsal checklist, slide build tooling
tests/                 cross-project load testing
```

## Design Commitments

- All examples use synthetic or aggregate precomputed data.
- Runtime interactions select among precomputed summaries rather than running association tests.
- The participant experience emphasizes interpretation and analytic tradeoffs, not software instruction.
- The app is designed to be deployable as static assets behind a CDN for a 75-150 person workshop.
- The open-access copy is served from GitHub Pages; a live session with in-platform polling runs on S3 private-bucket hosting behind CloudFront (`deploy/README.md`).
- The live poll is a **separable track** with three states — in-platform backend, an external poll tool, or unavailable. In every one of them all six scenario modules continue to work.

## Where the numbers come from

Every value in `data/scenarios/` is produced by `analysis/generate_scenarios.py` from a
fixed seed. Allele frequencies and ancestry composition are calibrated against published
aggregate references (gnomAD v4, 1000 Genomes Phase 3, *All of Us*); effect sizes are
synthetic and chosen for teaching legibility. Each bundle carries a `provenance` block
recording that split, and the app renders it in a "How these numbers were produced" panel
on every module — so the calibration claim is checkable by anyone in the room rather than
merely asserted.

Regenerating must be a no-op: after running the generator, `git diff data/scenarios`
should be empty. That is what proves the committed data actually came from the generator.

## Deployment

Every push to `main` publishes the static site to GitHub Pages
(`.github/workflows/pages.yml`) with no backend: the opening poll points at an external poll
tool if one is configured, and the facilitator view is open.

To run a live session with the in-platform poll, see [`deploy/README.md`](./deploy/README.md)
for the AWS runbook and [`deploy/aws-s3-cloudfront.md`](./deploy/aws-s3-cloudfront.md) for
the architecture and the reasoning behind it. Set `VITE_FACILITATOR_USERNAME` and
`VITE_FACILITATOR_PASSWORD` at build time to put the facilitator view behind a sign-in form.

## Open-access release

The workshop ran at ASHG 2026 in Montréal on October 20, 2026. The repository was private
until then, because `data/scenarios/` carries every module's derived answer and the room should
not have been able to read them during the session. This public repository starts from the
post-workshop tree. The design history is in [`docs/archive/`](./docs/archive/).

If you run your own session, keep that in mind: with a public fork, participants can read
the answers.

## License

Source code is MIT (`LICENSE`). Workshop content — the facilitator guide, scenario
narratives, and exported figures — is CC BY 4.0 (`LICENSE-CONTENT.md`), so other educators
can reuse and adapt the teaching material with attribution. Third-party figures and
branding in the slides are excluded; see [`slides/README.md`](./slides/README.md). See
`CITATION.cff` for how to cite the platform.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
