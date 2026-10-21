# Analysis and Preprocessing

The source of truth for every number the workshop displays. Nothing in
`data/scenarios/*.json` is hand-written; the app never computes a statistic at runtime.

| File | Role |
| --- | --- |
| `genetics.py` | statistical primitives: standard errors with covariate variance absorption, Wald tests, power, fixed- and random-effects meta-analysis, Cochran's Q, I², DerSimonian-Laird tau² |
| `reference_data.py` | real allele frequencies for five named variants (gnomAD v4, 1000 Genomes Phase 3) and the *All of Us* ancestry composition, with the scope of the calibration claim stated |
| `generate_scenarios.py` | one function per scenario; writes all six bundles plus `index.json` |

## Running it

```bash
python3 -m pip install -r requirements.txt
python3 analysis/generate_scenarios.py     # from the repository root
git diff data/scenarios                    # must be empty unless you intended a change
npm run validate:data
```

An empty diff is the point: it proves the committed bundles came from this generator and
not from an editor. The run is seeded (`SEED = 20260721`) and verified byte-reproducible
across numpy 2.2–2.5 and scipy 1.15–1.18.

## What is real and what is synthetic

Real: per-group allele frequencies for the named variants, and the ancestry composition
used to size cohorts. Synthetic: all effect sizes, chosen so each module's contrast is
legible in ten minutes. Every bundle records this split in its `provenance` block, which
`ProvenancePanel.tsx` renders in the app and `scripts/validate-scenarios.mjs` enforces.

## Two things to check after a change

1. **Read the output, not the exit code.** Three of six scenarios once produced numbers
   that inverted or erased their own teaching point while exiting zero — one had the
   global-ancestry model *more* significant than the local-ancestry model, the exact
   opposite of that module's thesis.
2. **Watch rounding on the log-axis charts.** The scalability module plots runtime and
   cost logarithmically, and a value rounded to exactly `0.0` is not drawn small — it is
   not drawn at all. `r_sig()` exists for this; the validator now rejects non-positive
   values on those series.

No individual-level genetic data belongs anywhere in this repository.
