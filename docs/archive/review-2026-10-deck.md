# Deck Review — October 2026

The platform checked against the organiser's slide deck (`ASHG_KJ_2026.pptx`, 11 slides,
as of 2026-10-14), six days before Montréal. Written to be shared with a co-organiser, so
it states problems plainly. `docs/archive/review-2026-07.md` is the earlier gap analysis against
the abstract; this one is against what will actually be projected.

**Baseline.** `v1.0.0-ashg` deployed on the CloudFront distribution; every
automated check green; the rehearsal checklist's remaining rows need a person in a room.

**Summary.** Where the deck and the platform overlap they agree, and the platform's
language is more careful than the deck's in one place (it never says "race"). The problems
are at the seams: one module quotes a locus that was removed in July, one chart label is
the ethnicity-for-ancestry conflation the deck spends two slides warning against, the two
ideas the deck names by name — Tractor and polygenic risk scores — are never named in the
platform even though two modules are built on them, and the deck itself stops where the
workshop starts. Everything the platform could fix is fixed below; what only the deck can
fix is listed at the end.

---

## A. What the deck contains

| # | Slide | Claim or content | Platform surface | Status |
|---|---|---|---|---|
| 1 | "Overall slides on Race Ancestry" | Working title | — | deck to-do |
| 2 | Genomics today | GWAS catalog is ~95% European-descent by study, ~78% by individual (Sirugo 2019); downstream effect on PRS | Module 1's ancestry-mix slider; module 5 | **Was unreachable**: the slider stopped at 75%. Now 35–95%. |
| 3 | Race versus Ancestry | Borrell et al. NEJM quote; admixture bars for Mexican American and Puerto Rican samples | Group naming across all charts | **One label conflated them** ("Latino/Admixed American"). Fixed. |
| 4 | Race / Ethnicity / Ancestry | Definitions; ancestry "can be genetically quantitated" | Same | Same. |
| 5 | Sirugo quote + PCSK9 | Diverse populations studied "only as part of large meta-analyses"; PCSK9 Y142X/C679X: 28% lower LDL, 88% lower CHD | Modules 1 and 2 | Aligned. The PCSK9 example is the *extreme* case (see B.6); the facilitator guide now says so. |
| 6 | Section: Local ancestry and TRACTOR | — | Module 3 | — |
| 7 | Local Ancestry Inference | PCA (global) vs RFMix mosaics (local); two individuals with the same global and different local ancestry (Zhang 2019) | Module 3's three models | Aligned. "Global ancestry PCs" is the PCA panel; the two local models are the RFMix panel at one locus. |
| 8 | Tractor (Atkinson 2021) | Ancestry segments analysed separately, then meta-analysed; more power where allele frequencies differ | Module 3 "Local ancestry interaction"; module 2 | **Never named.** Now named in module 3's facilitator note and provenance, and in the guide, with the "Same direction" preset as the caveat. |
| 9 | Section: Multi Ancestry PRS | — | Module 5 | — |
| 10 | PRS cohorts (Smith 2024, medRxiv) | Multi-ancestry PRS beats ancestry-specific for every group *except* African Americans; AFR was ~3% of the 1.1M cohort | Module 5 | **The module is this result and did not say so.** Narrative reframed; maths unchanged. |
| 11 | GPS_Mult (Nat Med 2023, Fig. 4) | External validation across ancestries | Module 5 | Same. |

No slide covers module 4 (over-adjustment) or module 6 (compute access), and the abstract
names GPU-accelerated frameworks explicitly. No slide carries the platform URL, the agenda,
the commit-then-reveal mechanic, a module's prediction question, or the synthesis.

---

## B. Findings and decisions

| # | Finding | Decision |
|---|---|---|
| 1 | **Module 6 named a locus the workshop no longer contains.** Its facilitator note said module 3 "rescued the Duffy-null signal". Module 3 was rewritten to MTHFR rs1801133 in July (review-2026-07, "paused mid-migration") because Duffy-null does not demonstrate the module's point. A facilitator reading the note aloud after slide 7 would have named the wrong gene. | **Fixed** in the generator; the note now names the MTHFR locus and the Tractor-style scan. |
| 2 | **"Latino/Admixed American" on every chart of modules 1, 3, 5.** Slides 3–4 distinguish race and ethnicity (self- or socially ascribed) from genetic ancestry (quantifiable). "Latino" is an ethnicity label; every other group label in the platform is "<X> ancestry". | **Fixed**: `GROUP_LABELS["amr"]` is "Admixed American ancestry" (gnomAD v4's term), with the reason recorded in `analysis/reference_data.py`. |
| 3 | **Tractor was never named.** Slide 8 is module 3's "local ancestry interaction" model at a single locus, and slide 8's "then meta-analysed" step is module 2. The connection had to be made by the facilitator from memory. The "Same direction" preset is also the honest caveat to "Tractor boosts power". | **Fixed** in module 3's facilitator note and provenance assumptions, and in the guide's bridge table. Model labels unchanged — polls, e2e, and the validator reference them. |
| 4 | **Module 5 is the deck's PRS result and did not say "PRS".** A shared score trained on the pooled cohort wins on global R² and loses calibration in the smallest group — Smith 2024's African-ancestry exception, with the "~3% of the cohort" line as the mechanism. The module described "multi-omic feature weights across immune, metabolic, and stress axes". | **Fixed, narrative only** (user decision): prompt, reveal, why-it-matters, facilitator note, discussion prompts, and the synthetic-inputs line now speak of a polygenic predictor trained on the pooled cohort versus ancestry-aware weights. Ids, labels, chart keys, and the maths are untouched. |
| 5 | **Module 1 could not reach "genomics today".** Slide 2 shows ~78–95% European; the slider topped out at 75%. Checked with `genetics.py` before changing: at 95% the pooled estimate is 0.023 (95% CI 0.007–0.039, p = 4.9e-3) — still significant, still on the European effect, so the derived answer is unchanged and the generator's guard still holds. | **Extended** to 35–95% (13 grid keys). The prediction question is derived from the range and now reads "35% to 95%"; `backend/polling/poll.mjs` updated to match, and the validator was confirmed to reject the stale wording first. |
| 6 | **The PCSK9 example on slide 5 invites "why not PCSK9?"** A loss-of-function allele absent in European ancestry cannot be diluted by pooling — the European sample carries no information about it. That is the same reasoning that retired Duffy-null from module 3. Module 1 deliberately shows the common-variant case, which is the one that goes unnoticed. | **Recorded** in module 1's facilitator note and the guide's bridge table. |
| 7 | **No slide for modules 4 and 6.** | Deck to-do (section D). The guide now gives a one-line introduction for each from module 3. |
| 8 | **The deck stops where the workshop starts.** No URL/QR, no agenda, no slide explaining commit-then-reveal (the guide schedules 15 minutes of "prediction practice"; the app's "Live practice poll" is an opinion poll with no reveal, so nothing practises the mechanic before module 1), no module slides, no synthesis. The rehearsal checklist requires every prediction question to be legible when projected, and the only copy was the facilitator guide — which had already drifted from the bundles (module 6's answer was worded differently from the poll option). | **Build**: `npm run export:slides` generates these 16 slides from the bundles and live chart captures, so a question or answer cannot be typed by hand (section C). The guide row is fixed. |
| 9 | Landing page showed "150 user target" — a capacity-planning figure — to participants. | **Fixed**: the fact strip now says how many predictions they will commit. |
| 10 | The facilitator run sheet carries no agenda or clock, and committed predictions are stored but not in the take-home export. | **Noted, not done.** Neither blocks the session; both are small. |

---

## C. Slides generated from the platform

`npm run export:slides` validates the bundles against the poll service, starts the app,
captures two chart panels per module at the default control state, and writes
`workshop/slides/platform-slides.pptx` — 16:9, Aptos, white, title at the organiser deck's
master title origin, so "Reuse Slides → use destination theme" drops them in cleanly.

| Slides | Source |
|---|---|
| Join: URL in large type, opening poll question and options | `--url` / `WORKSHOP_URL`; `practicePoll` in `backend/polling/poll.mjs` |
| Two-hour flow | parsed from the guide's table; the two "Interactive exercises" rows must sum to the bundles' module minutes or the build fails |
| How the modules work: commit → room split → explore → debrief | the guide's four-step flow |
| Per module, "Commit first": question and four options, correct one unmarked | `prediction` block; speaker notes carry `interpretation.prompt` |
| Per module, "Reveal": answer, `whatChanged`, two captured charts | bundle + live capture; speaker notes carry `facilitatorNote` and `whyItMatters` |
| Synthesis: module · question · derived answer | `prediction` blocks |

The capture config names chart titles; a title that no longer matches exactly one chart
card fails the build rather than producing a slide with a missing figure. The output is
gitignored (pptxgenjs writes timestamps, so it is never byte-stable); regenerate after any
generator change, as with `export:figures`.

---

## D. Deck-side to-do (only the organiser can do these)

1. Slide 1 is a working title. *(2026-10-14, later: the organiser's merged copy had added
   "(needs open poll in website)" to the join slide; resolved by the `#/poll` page in section G.)*
2. No slide for module 4 (adjustment as a *cost*, k/n) or module 6 (GPU-accelerated
   frameworks, which the abstract names). One slide each, or accept the one-line
   introductions now in the guide.
3. Slide 10's own notes say the figure legend cannot be read ("grey is multi ancestry").
4. Cite consistently: Zhang et al. 2019 (slide 7) and Atkinson et al. 2021 (slide 8) are on
   the slides; Borrell et al. (slide 3) and Fruchart 2010 (slide 5) are present; Smith et al.
   2024 is a medRxiv preprint — say so if it is still unpublished on the day.
5. Merge the generated slides: join slide after slide 1, agenda next, "How the modules
   work" after slide 11, then the twelve module slides in order, synthesis last. Check in
   PowerPoint that titles land on the same baseline as "Genomics today".

---

## E. Decisions taken after the review (2026-10-14)

- **Deployed** as `v1.1.0-ashg` from the merged branch; the deploy workflow runs on tags only,
  so merging to `main` alone had not shipped it.
- **The repository goes public after the workshop**, not before. A public tree would let the
  room read every derived answer from `data/scenarios/`. In preparation, the AWS account id,
  account name, and CloudFront distribution id were removed from the docs (they remain in
  git history, which a later history rewrite could address if wanted). The facilitator
  password in the Playwright config and scripts is a local-dev value, not the deployed one.
  The Northwestern service addresses in the runbook are published institutional contacts
  and stay.

## F. How this was verified

- `python3 analysis/generate_scenarios.py` then `git diff data/scenarios`: module 1 (four new
  grid keys, question, note), module 3 (note, provenance), module 5 (narrative), module 6
  (note), and the "amr" label in modules 1, 2, 3, 5. Nothing else moved.
- `npm run validate:data` rejected the stale 75% poll question before `poll.mjs` was
  updated, and passes after.
- `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, `npm run audit:controls`
  (module 1 now has 13 slider positions; every control must still change pixels).
- `npm run export:figures` regenerated the backup figures for the modules whose labels or
  text changed.
- `npm run export:slides`, then the generated deck validated structurally and rendered
  slide by slide for overflow and for the correct option *not* being marked on any
  "Commit first" slide.

---

## G. The organiser's walkthrough (2026-10-14, later the same day)

With `v1.1.0-ashg` live, the organiser walked the platform against the merged deck
(`workshop/slides/ASHG_KJ_2026_platform-slides.pptx`, a hand-edited copy of the generated
slides) and reported nine problems. Two were regressions against hard constraint 5
("controls must visibly do something") that every automated check had passed; the rest were
framing. Shipped as `v1.2.0-ashg` (PR #24).

| # | Finding | Decision |
|---|---|---|
| 1 | **The opening poll from slide 1 had no page.** It rendered as a small card in the landing-page aside, and only once a backend answered; the join slide had nowhere to point. | **Built**: `#/poll` (`OpeningPollPage.tsx`), linked from the landing page, the top nav, and the run sheet, which prints the join URL (`pollJoinUrl` in `router.ts`). The join slide carries it. Deliberately not a module: no derived answer, nothing to reveal; after answering, the room's counts appear through the same panel the facilitator projects. The old `PollingPanel` is gone. |
| 2 | **"Pooled" was drawn in the African-ancestry blue.** `ScenarioCharts.tsx` fell back to `palette[index]`, and `palette[0]` *is* `GROUP_COLORS["afr"]`; the same collision hit module 2's summary diamonds and module 3's single-slope rows. | **Fixed** with `apps/web/src/chartColors.ts`: groups keep their bundle colour; everything else (pooled, summaries, models, platforms) takes ink / cyan / magenta in order of first appearance and can never borrow a group hue. Unit-tested. Model curves also differ by dash pattern. The pre-existing blue/violet (afr/eas) pair fails a deutan check; only module 2 charts both, with labels and shapes as backup, and it was left alone. |
| 3 | **Module 1's effect direction was backwards for LCT.** The strong effect sat in African ancestry; rs4988235 is the *European* lactase-persistence allele, and persistence in African populations is carried by other variants. | **Flipped** to 0.02 African / 0.10 European / 0.07 Admixed American. The pooled estimate now *grows* onto the European effect as the slider rises (0.070 → 0.098), the African-ancestry interval includes zero at every mix (a new generator guard), and the lesson becomes the "Genomics today" slide: a precise, significant pooled number that is wrong for a third of the room, and the number a pooled PRS is built from (module 5). |
| 4 | **Module 2's synthesis select changed nothing on the charts.** It filtered only the association table; forest and heterogeneity ignored it, so the control the module is named after had no consequence on the chart it is about. The audit passed because the table repainted. | **Fixed**: forest rows carry `modelId` and the selected synthesis is emphasised; a new `weights` grid (each group's share of the fixed and random summaries) shows *why* the fixed-effect summary ignores heterogeneity (the East Asian group with the three-fold effect carries ~15% of the weight). Narrative rewritten around that goal. `synthesis-select.spec.ts` guards it and was confirmed to fail against the old charts. |
| 5 | **Module 3's take-home was only half stated.** The maths already showed both cases; the text told only the opposite-effects one. | **Rewritten**: local-ancestry modelling (stratify-then-combine, Tractor) buys power only when the effect differs between backgrounds; when it is similar the global scan wins *even though the allele frequencies differ* (0.11 vs 0.34); there is no one right way. Preset renamed "Same effect, different frequency"; the question states its premise; the detection panel says which model is best at the current settings. |
| 6 | **Module 4 was about generic covariates** (5 / 60 / 160 terms) when the deck is about local ancestry. | **Rebuilt** on module 3's three models (`background_models` and its helpers lifted to module level) at APOE rs7412 with one shared effect, so modules 3 and 4 are the two halves of one argument. The interaction model pays in degrees of freedom (`joint_power` in `genetics.py`): at n=500 global PCs and the covariate detect the locus (p=0.031), the interaction model does not (p=0.23); all three agree by 1,200. Global and covariate are deliberately near-identical (local ancestry explains 0.5% of genotype variance there), which *is* the lesson. New title, question, option ids, and guards. |
| 7 | **Module 5 still read as a multi-omic feature model.** July's reframing touched narrative only. | **PRS throughout**: title, model labels, control labels, chart titles, question, weight-block names. Ids and maths unchanged. The shrinkage path now marks the current penalty, so the slider touches every panel. |
| 8 | **Module 6's options said "all three" but named two analyses.** The question never told the participant what the three analyses were. | **Fixed**: the question names all three with their work multipliers (derived from the generator's `families`), and `feasibility` is now keyed by the variant slider, which had not moved it. |
| 9 | **Questions, options, and controls did not line up** across the board. | Every poll question in `backend/polling/poll.mjs` changed; the validator rejected each stale one before the generator and poll were brought back into agreement. `audit-controls` now scopes label lookups to the control panel, because module 5's question contains its control's label. |

Decisions taken along the way:

- `GENERATOR_VERSION` 1.0.0 → 1.1.0, since modules 1 and 4 changed their maths.
- Module 4's option ids changed (`global-and-covariate`, `global-only`), so the deployed
  counters were zeroed after the deploy with `npm run polling:reset` (all seven polls, 28
  counters) rather than left with phantom ids.
- The organiser's hand-edited deck predates these changes; `npm run export:slides` regenerates
  the 16 platform slides (new captures for modules 2, 4, and 5; new join slide) to re-merge.

How this was verified:

- `python3 analysis/generate_scenarios.py` twice: byte-for-byte stable; `npm run validate:data`
  passes. On this machine the generator runs through a throwaway `uv` environment, since the
  system Python has no scipy.
- `npm run lint`, `npm run test` (41), `npm run build`, `npm run test:e2e` (27, including the
  new module-2 guard and the poll-page spec), `npm run audit:controls` (12 of 12 controls),
  `npm run export:figures`, `npm run export:slides`.
- `#/poll` and the run sheet driven against a live local polling backend: the vote is counted,
  survives a reload, and the run sheet shows the counts and the join link.
- Deployed as `v1.2.0-ashg`; the workflow's post-deploy smoke check passed and the live API
  serves the new option ids.

### G.2 Second pass: the model select must change the plots, not their opacity

The organiser's second look at `v1.2.0-ashg` found that "highlighting" the selected model by
dimming the others reads as nothing happening: modules 1–5 all "seem to just highlight one
group", while module 6 was the only one whose select visibly changed the plots (it filters
the bars by platform). Decision: **every model select now filters what is drawn**, the way
module 6's platform select does. Each module keeps one comparison panel that always shows
every model (the scoreboard), and every other panel draws only the selected model's output.

| Module | Scoreboard (all models) | Panels the select now redraws |
|---|---|---|
| 1 | — | Effect estimates (the selected strategy's bars, with 95% whiskers; the other strategy's estimates stay as labelled dashed lines) and the power curve |
| 2 | Heterogeneity statistics (slider only) | Forest plot (within-ancestry: four group rows; a meta-analysis: those rows with the weight each carries printed on the label, plus its diamond) and a new "What this synthesis reports" panel (four p-values vs one) |
| 3 | Does it detect the locus? | Regional signal (the selected model's scan, on an axis fixed across models so a flat scan stays flat) and the forest plot |
| 4 | Does it detect the locus? | Forest plot (one tight interval under global PCs; three wide per-background intervals under the interaction model) and the power curve |
| 5 | Score accuracy (global R²) | Calibration by ancestry and weight shrinkage (`coefficientPath` is now keyed by the score; the ancestry-aware path is drawn for the smallest group) |
| 6 | — | Unchanged, plus a **laptop (8 cores)** platform, the machine most of the room has; on it the local ancestry-aware scan also drops out of the week at 20 million variants |

Each chart's data table carries a `shown` column, so the select is legible to a screen
reader as well. `synthesis-select.spec.ts` now asserts on the forest and the reported-evidence
tables. Verified with the same list as G: generator no-op, validator, lint, 41 unit tests, 27
e2e tests, `audit:controls` on all 12 controls, figures and slides re-exported, and every
module screenshotted at a non-default select value.

### G.3 Third pass: layout, named covariates, and the platform in the question

1. **The panels the select redraws were a screen below the controls** (module 3: allele
   frequency and the forest came first). Allele frequencies are now a "Fixed at this locus"
   table inside the decision box, in every module that has them (1–4), and the chart builders
   run in a fixed order that puts the select-driven panels next to the controls. A fixed
   parameter reads as a premise there, not as a result. The control panel is single-column
   with the controls across its full width, and the learning objectives moved to the side
   column, so at 1440×900 the first chart row starts above the fold in module 3.
2. **Module 4's "terms" had no biology.** Two toggles add named covariate blocks: clinical
   (BMI, smoking, statin use; 3 terms explaining 20% of LDL variance) and technical
   (genotyping batch, site, plate; 60 indicators explaining 2%). Each costs k/n of genotype
   variance and buys back the outcome variance it explains; local-ancestry terms cost genotype
   variance; the interaction model costs degrees of freedom. At n=500 the global-PC p-value is
   0.031 alone, 0.016 with the clinical block, 0.036 with the technical block, and the
   technical cost is largest at n=250. A generator guard asserts the two blocks pull in
   opposite directions. The question now states the baseline adjustment (age, sex, ten PCs).
3. **Module 6's question named neither the platform nor the scans plainly.** It now reads
   "on a Single CPU node (52 cores)" and names the standard GWAS scan, the local ancestry-aware
   scan, and the permutation scan; the options use the same names. When another platform is
   selected, the runtime chart keeps the node's bars hollow beside it and says how many times
   longer (or shorter) everything takes; the feasibility panel says how many scans fit in a
   week here versus on the node in the question.

### G.4 Module 6 pricing had no source

The organiser asked where the cost panel's prices came from. The $2.60 / $52 / $13 hourly
rates had been typed in on 2026-07-21 with no citation, which sat uneasily with hard
constraint 4. Decisions:

- **Hardware classes are Bridges-2 node types** (Pittsburgh Supercomputing Center): a
  Regular Memory node (128 cores, two AMD EPYC 7742), twenty of them, and a GPU node (8×
  H100-80GB), plus the laptop. Bridges-2 publishes no hourly dollar rate: it is free for
  research and education through NSF ACCESS allocations and charged in service units (1 SU
  per core-hour on RM nodes, 2 SU per GPU-hour on H100 nodes). A new "Allocation cost on
  Bridges-2" panel charts SUs per scan with the 400,000-credit ACCESS Explore allocation as a
  reference line, at ACCESS's own approximation of a credit as one core-hour (the exact
  exchange rate is only in ACCESS's calculator, which is not fetchable).
- **AWS and Google Cloud estimates** for the same classes, as grouped bars in the cost panel:
  on-demand list prices quoted on 2026-10-14 for the closest instance (AWS c7a.32xlarge,
  p5.48xlarge, c7a.2xlarge in us-east-1; Google Cloud c3d-standard-360 pro-rated to 128
  physical cores, a3-highgpu-8g, c3d-standard-8 in us-central1). The laptop's figure is
  electricity at about 70 W.
- **An information block**, "Where the prices come from", rendered under the charts from
  the bundle's new `infoPanels` field, states all of the above and that these are estimates
  of shape, not invoices (no discounts, storage, transfer or staff time; order-of-magnitude
  throughputs).
- The derived answer is unchanged (standard and local ancestry-aware scans fit the week on
  the RM node; the permutation scan does not), and the question now names the RM node. The
  GPU node is both faster and cheaper in SUs, which the facilitator note now uses: "who can
  afford it" is mostly "who has an allocation and the expertise to use it".
