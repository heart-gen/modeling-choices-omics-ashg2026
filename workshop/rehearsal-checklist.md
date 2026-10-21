# Pre-Conference Rehearsal Checklist

## Automated — covered by `npm run test:e2e` and friends

- [x] Scenario data generated and validated (freeze again for the release tag).
- [x] Every control visibly changes rendered results (`npm run audit:controls`, 12/12).
- [x] Desktop, tablet, and mobile layouts checked (`e2e/responsive.spec.ts`).
- [x] Keyboard navigation checked for all controls (`e2e/keyboard.spec.ts`).
- [x] Take-home summary export tested (`e2e/take-home.spec.ts`).
- [x] Backup screenshots exported for all six modules (`npm run export:figures`).
- [x] Facilitator mode tested end to end.
- [x] Polling load test completed with 200 concurrent writes (local).

## Requires the deployment — done 2026-09-16

Deployed at the CloudFront distribution URL; the facilitator run sheet is its `/facilitator`
path.

- [x] Stack deployed and smoke check green (`deploy/README.md`). Tag `v1.0.0-ashg`.
- [x] Polling load test re-run against the production URL *(AWS only — there is no backend
      behind the Pages copy)*: 200 concurrent writes in 1842 ms, all 200 recorded
      (50 per option), so the atomic counters hold under the opening-question burst.
- [ ] Production URL tested on conference Wi-Fi or an equivalently constrained network.
- [ ] Whichever poll is live — in-platform chart or external join link — projected and
      legible from the back of a room.
- [x] Poll counts reset after rehearsal *(AWS only)* (`npm run polling:reset`) — 28 option
      counts across 7 polls cleared, snapshot back to 0. Run again before doors open.
- [x] Release tag created for the exact workshop version, and `data/scenarios` TTL raised
      (300s → 86400s).

Verified at the edge on the same day: all six bundles and all seven polls return 200
through the distribution; `index.html` is `no-cache`, `assets/*` is `immutable`, and
`data/scenarios/*.json` is `max-age=86400`; the 1.33 MB module-3 bundle is served gzipped
at 126 KB; the facilitator path returns 401 without credentials and with wrong ones, and
the app shell with the right pair.

## GitHub Pages deployment — if the session runs without AWS

See `deploy/README.md`, "GitHub Pages".

- [ ] Pages workflow green, and the site loads at the project sub-path.
- [ ] Six scenario cards render — a base-path bug shows as "Data loading error", not a
      blank page.
- [ ] `#/facilitator` opens the run sheet, and "Open module" navigates from it.
- [ ] `<base>/facilitator` typed directly also opens it (the `404.html` fallback).
- [ ] External poll link opens on a phone, on cellular.
- [ ] Poll join link legible when projected from the back of the room.
- [ ] Facilitator view behaves as intended for this run: open with no `VITE_FACILITATOR_*`
      set (the open-access build), or behind the sign-in form when both are set.

## On the day

- [ ] Backup figures (`data/figures-backup/`) open and to hand, in case the venue network
      fails mid-session.
- [ ] Facilitator credentials confirmed working at the edge **and** in the app — one pair
      through the browser prompt and the sign-in form behind it. The two gates take their
      credential from different places and were deployed disagreeing once already; the deploy
      smoke check now fails on that, but confirm it by signing in, not by curl.
- [ ] Confirm the poll answers, then reset once more before doors open.

## Committed predictions (all six modules)

- [x] Gate, reveal, persistence, and presets covered by `e2e/prediction.spec.ts`.
- [ ] Every prediction question legible when projected from the back of the room — six
      questions, one per module, on the generated "Commit first" slides
      (`npm run export:slides`, `workshop/slides/README.md`). The guide's table is a
      convenience copy and has drifted once; the slides are built from the bundles.
- [ ] Deck rebuilt after the last generator change (`npm run export:slides`, which ends in
      `build:deck`) and opened in PowerPoint: it opens without a repair prompt, Poppins is
      the font in use, and no "Commit first" slide marks the answer.
- [x] Disclosure slides filled in (slides 2 and 3 of the built deck, from ASHG's template):
      neither presenter has a relationship to report or discusses unlabeled uses.
- [ ] Both disclosure slides shown and read aloud at the start of the session.
- [ ] Deck uploaded on the ASHG Presentation Upload Site before travel, or in Room 516A
      at least three hours before the session. No laptop or thumb drive at the podium.
- [ ] "Room vs reality" panel on the run sheet shows counts for each module during
      rehearsal *(AWS only)*.
- [ ] Prediction counts reset before doors open *(AWS only)*: `npm run polling:reset` clears
      all seven polls; `POLL_ID=predict-global-vs-local-ancestry npm run polling:reset`
      clears one.
- [ ] Decided what to do if the poll service is down mid-session: the commit still reveals
      locally, so the fallback is a show of hands before the reveal.

## After the session

- [x] Release the platform publicly (decided 2026-10-14; see
      `docs/archive/review-2026-10-deck.md`). Not before: `data/scenarios/` carries every
      module's derived answer, and the room should not be able to read it mid-session.
      Released after ASHG 2026 as a fresh repository with no AWS identifiers in its history.
      If you run your own session from a public fork, the answers are readable — accept that,
      or run from a private copy.

## Manual walkthrough — not substitutable by the automated checks

Run `npm run dev` (or open the production URL), then for each of the six modules:

- [ ] Move every control and confirm something visibly changes.
- [ ] Open "How these numbers were produced" and confirm the provenance panel is populated.
- [ ] Commit a prediction, reveal it, and confirm the reveal reads sensibly.

Inert sliders passed every automated check in this repository for months. This walkthrough
is the check that would have caught them.
