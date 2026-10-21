#!/usr/bin/env python3
"""Generate every runtime scenario bundle in ``data/scenarios`` from stated assumptions.

Run from the repository root::

    python analysis/generate_scenarios.py

Regenerating should be a no-op on a clean checkout. If ``git diff data/scenarios`` is
non-empty after a run, either an assumption changed or a bundle was hand-edited; both
are worth knowing about, which is why the workshop release process checks it.

What is real and what is synthetic is documented in ``reference_data.py`` and travels
with each bundle in its ``provenance`` block.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from genetics import (
    GroupEstimate,
    effective_sample_size,
    fixed_effect_meta,
    joint_power,
    joint_wald_p,
    power,
    random_effects_meta,
    standard_error,
    wald_p,
)
from reference_data import (
    ALL_OF_US_SOURCE,
    GROUP_COLORS,
    GROUP_LABELS,
    VARIANTS,
    cohort,
)

SEED = 20260721
GENERATOR_VERSION = "1.1.0"
SCHEMA_VERSION = "0.2.0"

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "scenarios"

# Single pre-specified locus, so a conventional two-sided 0.05 threshold is the honest
# choice. The scalability scenario, which is genuinely genome-wide, uses 5e-8 instead
# and says so in its own provenance block.
ALPHA_LOCUS = 0.05
ALPHA_GENOME_WIDE = 5e-8

# Above this, a bundle is written without indentation: see main().
PRETTY_MAX_BYTES = 1_000_000


# --------------------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------------------


def r2(value: float, places: int = 3) -> float:
    """Round for display. Bundles are read by humans as well as by the app."""
    return float(round(value, places))


def r_sig(value: float, sig: int = 3, min_places: int = 2) -> float:
    """Round for display, keeping ``sig`` significant digits however small the value is.

    The scalability module plots runtime and cost on logarithmic axes, and log(0) does not
    exist: a value rounded to exactly 0.0 is not drawn small, it is not drawn at all. Plain
    two-decimal rounding did precisely that to the sub-minute GPU runtimes, so the fastest
    platform — the module's whole argument — had missing bars.
    """
    if value == 0:
        return 0.0
    places = max(min_places, sig - 1 - math.floor(math.log10(abs(value))))
    return float(round(value, places))


def provenance(
    *,
    variant_keys: list[str],
    alpha: float,
    assumptions: list[str],
    synthetic: list[str],
) -> dict[str, Any]:
    """The block that makes each bundle's calibration claim checkable."""
    return {
        "generator": "analysis/generate_scenarios.py",
        "generatorVersion": GENERATOR_VERSION,
        "seed": SEED,
        "alpha": alpha,
        "realInputs": {
            "alleleFrequencies": [
                {
                    "rsid": VARIANTS[key].rsid,
                    "gene": VARIANTS[key].gene,
                    "locus": VARIANTS[key].locus,
                    "trait": VARIANTS[key].trait,
                    "source": VARIANTS[key].source,
                    "note": VARIANTS[key].note,
                }
                for key in variant_keys
            ],
            "ancestryDistribution": ALL_OF_US_SOURCE,
        },
        "syntheticInputs": synthetic,
        "assumptions": assumptions,
        "derived": (
            "Standard errors, p-values, power, meta-analysis summaries, and heterogeneity "
            "statistics are computed from the inputs above by analysis/genetics.py; none "
            "are hand-entered."
        ),
    }


def by_control(control_id: str, values: dict[Any, Any]) -> dict[str, Any]:
    """Wrap a set of precomputed series keyed by the value of an interactive control."""
    return {
        "byControl": control_id,
        "values": {str(key): value for key, value in values.items()},
    }


def js_key(value: Any) -> str:
    """A control value exactly as JavaScript's ``String()`` renders it.

    Grid keys are read back by ``gridKeyPart`` in apps/web/src/scenarioUtils.ts and checked
    by scripts/validate-scenarios.mjs, so the three spellings have to agree. The rounding
    matters: stepping a range input can produce -0.039999999999999994 where Python's
    arithmetic lands on -0.04, and a key that misses makes every chart fall back to the
    defaults while the slider still moves — an inert control, the worst bug this repository
    has had.
    """
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        rounded = round(value, 10)
        return str(int(rounded)) if rounded == int(rounded) else repr(rounded)
    return str(value)


def by_controls(control_ids: list[str], values: dict[tuple, Any]) -> dict[str, Any]:
    """Wrap precomputed series keyed by several controls at once.

    The key is each control's value in ``control_ids`` order, joined by "|". Used where the
    parameters interact and a one-control grid cannot express the combination.
    """
    return {
        "byControls": control_ids,
        "values": {"|".join(js_key(part) for part in key): value for key, value in values.items()},
    }


def group_meta(group_ids: list[str], sizes: dict[str, int], freqs: dict[str, float]) -> list[dict]:
    return [
        {
            "id": gid,
            "label": GROUP_LABELS[gid],
            "color": GROUP_COLORS[gid],
            "n": sizes[gid],
            "af": r2(freqs[gid]),
        }
        for gid in group_ids
    ]


# --------------------------------------------------------------------------------------
# scenario 1 — pooled vs stratified
# --------------------------------------------------------------------------------------


def scenario_pooled_vs_stratified() -> dict[str, Any]:
    variant = VARIANTS["rs4988235"]
    group_ids = ["afr", "eur", "amr"]
    freqs = {g: variant.frequencies[g] for g in group_ids}
    total_n = 40_000

    # Synthetic, declared, but in the direction the biology points: rs4988235 (-13910*T) is
    # the European lactase-persistence allele, and persistence in African populations is
    # carried by different regulatory variants, so this tag SNP has a strong effect on
    # European haplotypes and almost none on African ones. The admixed group sits between.
    # Effect sizes are in the range typical of common-variant associations on a
    # standardised quantitative trait.
    true_beta = {"afr": 0.02, "eur": 0.10, "amr": 0.07}

    # European share of the pooled sample, percent. The top of the range is where the
    # GWAS catalog sits today (~95% of studies European-descent on the framing slides), so
    # the room can set "genomics today" rather than only a diversified cohort.
    mix_values = list(range(35, 100, 5))
    default_mix = 55

    effect_grid: dict[int, list[dict]] = {}
    power_grid: dict[int, list[dict]] = {}
    sizes_at_default: dict[str, int] = {}

    for mix in mix_values:
        eur_n = int(round(total_n * mix / 100.0 / 10.0)) * 10
        rest = total_n - eur_n
        # Remaining capacity split between AFR and AMR at their All of Us ratio.
        rest_split = cohort(rest, ["afr", "amr"])
        sizes = {"eur": eur_n, **rest_split}
        if mix == default_mix:
            sizes_at_default = dict(sizes)

        estimates = [
            GroupEstimate(
                group_id=g,
                label=GROUP_LABELS[g],
                n=sizes[g],
                af=freqs[g],
                beta=true_beta[g],
                se=standard_error(sizes[g], freqs[g]),
            )
            for g in group_ids
        ]

        # A pooled regression with ancestry covariates estimates the information-weighted
        # average of the group-specific effects, which is exactly the fixed-effect
        # combination of these estimates.
        pooled = fixed_effect_meta(estimates)

        rows = [
            {
                "label": "Pooled",
                "modelId": "pooled",
                "beta": r2(pooled.beta),
                "lower": r2(pooled.ci()[0]),
                "upper": r2(pooled.ci()[1]),
            }
        ]
        for est in estimates:
            lo, hi = est.ci()
            rows.append(
                {
                    "label": est.label,
                    "groupId": est.group_id,
                    "modelId": "stratified",
                    "beta": r2(est.beta),
                    "lower": r2(lo),
                    "upper": r2(hi),
                }
            )
        effect_grid[mix] = rows

        curve = []
        for n in (5_000, 10_000, 20_000, 40_000, 80_000):
            se_pooled = 1.0 / math.sqrt(
                sum(effective_sample_size(int(n * sizes[g] / total_n), freqs[g]) for g in group_ids)
            )
            curve.append(
                {
                    "label": "Pooled",
                    "modelId": "pooled",
                    "n": n,
                    "power": r2(power(pooled.beta, se_pooled, ALPHA_LOCUS)),
                }
            )
        for est in estimates:
            for scale in (0.5, 1.0, 1.5, 2.0):
                n = int(est.n * scale)
                if n < 100:
                    continue
                curve.append(
                    {
                        "label": est.label,
                        "groupId": est.group_id,
                        "modelId": "stratified",
                        "n": n,
                        "power": r2(
                            power(est.beta, standard_error(n, est.af), ALPHA_LOCUS)
                        ),
                    }
                )
        power_grid[mix] = curve

    estimates_default = [
        GroupEstimate(
            group_id=g,
            label=GROUP_LABELS[g],
            n=sizes_at_default[g],
            af=freqs[g],
            beta=true_beta[g],
            se=standard_error(sizes_at_default[g], freqs[g]),
        )
        for g in group_ids
    ]
    pooled_default = fixed_effect_meta(estimates_default)

    # The prediction's answer is read off the precomputed grid rather than typed in: the
    # pooled row's interval already encodes significance, so both the direction and the
    # "does it survive" distractor are derived.
    low_mix, high_mix = min(mix_values), max(mix_values)

    def pooled_row(mix: int) -> dict:
        return next(row for row in effect_grid[mix] if row["modelId"] == "pooled")

    pooled_low, pooled_high = pooled_row(low_mix), pooled_row(high_mix)
    if pooled_high["lower"] <= 0.0:
        pooled_answer = "loses-significance"
    elif abs(pooled_high["beta"] - pooled_low["beta"]) < 0.005:
        pooled_answer = "unchanged"
    elif abs(pooled_high["beta"] - true_beta["eur"]) < abs(pooled_low["beta"] - true_beta["eur"]):
        pooled_answer = "toward-european"
    else:
        pooled_answer = "toward-african"
    if pooled_answer != "toward-european":
        raise SystemExit(
            "pooled-vs-stratified no longer shows the pooled estimate growing toward the "
            f"dominant group's strong effect (answer: {pooled_answer})"
        )
    # The other half of the lesson: the pooled result is significant at every mix while the
    # African-ancestry estimate never leaves the null, so nothing in the pooled output says
    # the finding does not transfer. If the small effect ever became detectable the module
    # would be teaching something else.
    for mix, rows in effect_grid.items():
        afr_row = next(row for row in rows if row["label"] == GROUP_LABELS["afr"])
        if afr_row["lower"] > 0.0:
            raise SystemExit(
                f"pooled-vs-stratified: the African-ancestry effect is significant at mix {mix}%, "
                "so the pooled estimate no longer hides a non-transferring result"
            )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scenarioId": "pooled-vs-stratified",
        "title": "Pooled vs Stratified Analysis",
        "subtitle": "Power, precision, and hidden heterogeneity",
        "estimatedMinutes": 10,
        "learningObjectives": [
            "Compare pooled and stratified association estimates as the sample composition changes.",
            "Explain why a precise, significant pooled estimate can describe only the dominant group.",
            "Identify when stratified estimates are needed before a finding is applied to another group.",
        ],
        "ancestryGroups": group_meta(group_ids, sizes_at_default, freqs),
        "prediction": {
            "pollId": "predict-pooled-vs-stratified",
            "question": (
                f"Raise the European-ancestry share of the pooled sample from {low_mix}% to "
                f"{high_mix}%. What happens to the pooled effect estimate?"
            ),
            "options": [
                {"id": "toward-european", "label": "It grows toward the strong European-ancestry effect"},
                {"id": "toward-african", "label": "It shrinks toward the weak African-ancestry effect"},
                {"id": "unchanged", "label": "It stays put; only the interval changes"},
                {"id": "loses-significance", "label": "It stops being significant"},
            ],
            "correctOptionId": pooled_answer,
        },
        "controls": [
            {
                "id": "modelId",
                "label": "Analysis strategy",
                "type": "select",
                "default": "pooled",
                "values": [
                    {"value": "pooled", "label": "Pooled"},
                    {"value": "stratified", "label": "Stratified"},
                ],
            },
            {
                "id": "ancestryMix",
                "label": "European-ancestry share in pooled sample (%)",
                "type": "slider",
                "default": default_mix,
                "min": min(mix_values),
                "max": max(mix_values),
                "step": 5,
            },
        ],
        "variant": {
            "rsid": variant.rsid,
            "gene": variant.gene,
            "locus": variant.locus,
            "trait": variant.trait,
        },
        "alleleFrequencies": [
            {"variantId": variant.rsid, "groupId": g, "af": r2(freqs[g])} for g in group_ids
        ],
        "simulatedEffects": [
            {
                "variantId": variant.rsid,
                "groupId": g,
                "beta": true_beta[g],
                "mechanism": mech,
            }
            for g, mech in [
                ("afr", "Near-null: African lactase persistence is carried by other variants"),
                ("eur", "Strong: the European lactase-persistence allele"),
                ("amr", "Intermediate: admixed haplotype background"),
            ]
        ],
        "associationResults": [
            {
                "modelId": "pooled",
                "variantId": variant.rsid,
                "beta": r2(pooled_default.beta),
                "se": r2(pooled_default.se),
                "p": pooled_default.p,
            },
            *[
                {
                    "modelId": "stratified",
                    "variantId": variant.rsid,
                    "groupId": est.group_id,
                    "beta": r2(est.beta),
                    "se": r2(est.se),
                    "p": est.p,
                }
                for est in estimates_default
            ],
        ],
        "powerEstimates": [
            {
                "modelId": "stratified",
                "groupId": est.group_id,
                "n": est.n,
                "effectSize": est.beta,
                "power": r2(power(est.beta, est.se, ALPHA_LOCUS)),
            }
            for est in estimates_default
        ],
        "interpretation": {
            "prompt": (
                "Before switching models, predict whether a single pooled estimate will "
                "describe every ancestry group in the sample, or only the largest one."
            ),
            "whatChanged": (
                "The pooled estimate is the most precise number on the screen and it is "
                "significant at every mix. As the European-ancestry share rises it moves onto "
                "the strong European effect, because a pooled regression is an information-"
                "weighted average and the European group carries most of the information. "
                "The African-ancestry estimate is 0.02 with an interval that includes zero at "
                "every mix, and nothing in the pooled output says so."
            ),
            "whyItMatters": (
                "A pooled result can look efficient and decisive while describing only the "
                "dominant group. Applied to the underrepresented group, it overstates an effect "
                "that may barely exist there; this is the same number a pooled polygenic score "
                "is built from (module 5)."
            ),
            "facilitatorNote": (
                "Move the ancestry-mix slider and watch the pooled estimate migrate toward "
                "whichever group dominates the sample. The stratified estimates do not move. "
                "The top of the slider is the GWAS catalog today (the 'Genomics today' slide): "
                "the pooled estimate equals the European effect and is highly significant, "
                "while the African-ancestry estimate has never been distinguishable from zero. "
                "Point out that the direction is the real LCT biology: rs4988235 is the European "
                "persistence allele, and persistence in African populations is carried by other "
                "variants that this SNP does not tag. If the room asks why this is not the PCSK9 "
                "example from the framing slides: a loss-of-function allele absent in European "
                "ancestry cannot be diluted by pooling, because the European sample carries no "
                "information about it. This module shows the more common and less visible case, "
                "where the pooled number is real, significant, and wrong for a third of the room."
            ),
        },
        "vizSummaries": {
            "effectComparisons": by_control("ancestryMix", effect_grid),
            "powerCurve": by_control("ancestryMix", power_grid),
            "discussionPrompts": [
                "Which estimate would you report if the finding were to be applied in an African-ancestry clinic?",
                "What would change if the underrepresented group had the largest sample size?",
            ],
        },
        "provenance": provenance(
            variant_keys=["rs4988235"],
            alpha=ALPHA_LOCUS,
            synthetic=[
                "Group-specific effect sizes (0.02 African / 0.10 European / 0.07 Admixed "
                "American, phenotype SD per allele) are chosen to make the pooled-vs-stratified "
                "contrast legible; they are not published LCT effect estimates. Their direction "
                "follows the known biology: rs4988235 is the European lactase-persistence allele, "
                "and persistence in African populations is carried by other regulatory variants.",
            ],
            assumptions=[
                "Additive dosage model, Hardy-Weinberg equilibrium, continuous phenotype "
                "standardised to unit variance.",
                "The pooled estimator equals the inverse-variance-weighted combination of "
                "the group-specific effects under a common residual variance.",
                f"Two-sided Wald tests at alpha = {ALPHA_LOCUS} for a single pre-specified locus.",
            ],
        ),
    }


# --------------------------------------------------------------------------------------
# scenario 2 — within-ancestry vs meta-analysis
# --------------------------------------------------------------------------------------


def scenario_within_vs_meta() -> dict[str, Any]:
    variant = VARIANTS["rs1229984"]
    group_ids = ["afr", "eur", "eas", "amr"]
    freqs = {g: variant.frequencies[g] for g in group_ids}
    sizes = cohort(120_000, group_ids)

    # Synthetic, declared. At full heterogeneity the groups genuinely disagree; the
    # slider interpolates each group toward the common mean, so heterogeneity is a
    # controlled input rather than an accident of the numbers.
    # ADH1B His48 has a genuinely much larger effect in East Asian ancestry, which is
    # also the smallest group in the cohort. That combination is the module's point.
    dispersed_beta = {"afr": 0.05, "eur": 0.06, "eas": 0.22, "amr": 0.08}
    common_beta = float(np.mean(list(dispersed_beta.values())))

    het_values = list(range(0, 110, 10))
    default_het = 60

    forest_grid: dict[int, list[dict]] = {}
    het_grid: dict[int, list[dict]] = {}
    reported_grid: dict[int, list[dict]] = {}
    assoc_at_default: list[dict] = []
    threshold = r2(-math.log10(ALPHA_LOCUS), 2)

    for het in het_values:
        scale = het / 100.0
        estimates = [
            GroupEstimate(
                group_id=g,
                label=GROUP_LABELS[g],
                n=sizes[g],
                af=freqs[g],
                beta=common_beta + scale * (dispersed_beta[g] - common_beta),
                se=standard_error(sizes[g], freqs[g]),
            )
            for g in group_ids
        ]
        fixed = fixed_effect_meta(estimates)
        random = random_effects_meta(estimates)

        # The weight each group receives in each summary, in percent. Fixed-effect weights
        # are inverse-variance shares and never move with heterogeneity; random-effects
        # weights are 1 / (se² + tau²) shares, which tau² pulls toward equality. This is
        # *why* the fixed-effect summary stays narrow: the group carrying the large effect
        # is also the one carrying the least weight. The forest plot prints them on the
        # group rows under whichever summary is selected.
        total_fixed = sum(est.weight for est in estimates)
        random_weights = [1.0 / (est.se**2 + random.tau_squared) for est in estimates]
        total_random = sum(random_weights)
        weights = {
            est.group_id: {
                "fixed_meta": r2(100.0 * est.weight / total_fixed, 1),
                "random_meta": r2(100.0 * float(w) / total_random, 1),
            }
            for est, w in zip(estimates, random_weights)
        }

        # Rows carry the synthesis they belong to, so the "Evidence synthesis" select can
        # draw only what that synthesis reports: within-ancestry testing is the group rows
        # alone; each meta-analysis is the group rows it combines (pinned) plus its own
        # summary diamond.
        rows = []
        for est in estimates:
            lo, hi = est.ci()
            rows.append(
                {
                    "label": est.label,
                    "groupId": est.group_id,
                    "modelId": "within",
                    "pinned": True,
                    "weights": weights[est.group_id],
                    "beta": r2(est.beta),
                    "lower": r2(lo),
                    "upper": r2(hi),
                    "kind": "group",
                }
            )
        for name, model_id, res in (
            ("Fixed-effect summary", "fixed_meta", fixed),
            ("Random-effects summary", "random_meta", random),
        ):
            lo, hi = res.ci()
            rows.append(
                {
                    "label": name,
                    "modelId": model_id,
                    "beta": r2(res.beta),
                    "lower": r2(lo),
                    "upper": r2(hi),
                    "kind": "summary",
                }
            )
        forest_grid[het] = rows

        # What each synthesis actually reports, as evidence: four p-values under
        # within-ancestry testing, one under either meta-analysis. The fixed-effect p-value
        # staying impressive while the random-effects one slides is the module's thesis.
        def reported(label: str, model_id: str, p_value: float, group_id: str | None = None) -> dict:
            return {
                "label": label,
                "modelId": model_id,
                **({"groupId": group_id} if group_id else {}),
                "p": r_sig(p_value, 3),
                "minusLog10P": r2(-math.log10(max(p_value, 1e-300)), 2),
                "detected": bool(p_value < ALPHA_LOCUS),
                "threshold": threshold,
            }

        reported_grid[het] = [
            *[reported(est.label, "within", est.p, est.group_id) for est in estimates],
            reported("Fixed-effect summary", "fixed_meta", fixed.p),
            reported("Random-effects summary", "random_meta", random.p),
        ]

        het_grid[het] = [
            {"metric": "I² (%)", "value": r2(100 * fixed.i_squared, 1)},
            {"metric": "Cochran Q", "value": r2(fixed.q, 2)},
            {"metric": "Q p-value", "value": float(f"{fixed.q_p:.3g}")},
            {"metric": "tau²", "value": r2(random.tau_squared, 4)},
        ]

        if het == default_het:
            assoc_at_default = [
                *[
                    {
                        "modelId": "within",
                        "variantId": variant.rsid,
                        "groupId": est.group_id,
                        "beta": r2(est.beta),
                        "se": r2(est.se),
                        "p": est.p,
                    }
                    for est in estimates
                ],
                {
                    "modelId": "fixed_meta",
                    "variantId": variant.rsid,
                    "beta": r2(fixed.beta),
                    "se": r2(fixed.se),
                    "p": fixed.p,
                },
                {
                    "modelId": "random_meta",
                    "variantId": variant.rsid,
                    "beta": r2(random.beta),
                    "se": r2(random.se),
                    "p": random.p,
                },
            ]

    # Derived from the forest rows at maximum heterogeneity. The interesting distractor is
    # "widens": the random-effects interval does, and the fixed-effect one does not, which is
    # exactly the asymmetry the module exists to show.
    max_het = max(het_values)
    summaries = {row["label"]: row for row in forest_grid[max_het] if row["kind"] == "summary"}
    fixed_row, random_row = summaries["Fixed-effect summary"], summaries["Random-effects summary"]
    fixed_width = fixed_row["upper"] - fixed_row["lower"]
    random_width = random_row["upper"] - random_row["lower"]
    if fixed_row["beta"] <= 0.0:
        meta_answer = "flips"
    elif fixed_row["lower"] <= 0.0:
        meta_answer = "non-significant"
    elif fixed_width >= 0.5 * random_width:
        meta_answer = "widens"
    else:
        meta_answer = "stays-narrow"
    if meta_answer != "stays-narrow":
        raise SystemExit(
            "within-vs-meta no longer shows the fixed-effect summary holding its precision "
            f"under maximum heterogeneity (answer: {meta_answer})"
        )

    # The question states its premise so it can be reasoned about rather than guessed: how
    # much larger the largest dispersed effect is than the rest, derived from the inputs.
    largest_group = max(dispersed_beta, key=lambda g: dispersed_beta[g])
    others_mean = float(np.mean([b for g, b in dispersed_beta.items() if g != largest_group]))
    effect_ratio = int(round(dispersed_beta[largest_group] / others_mean))
    largest_label = GROUP_LABELS[largest_group].replace(" ancestry", "")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scenarioId": "within-vs-meta",
        "title": "Within-Ancestry Testing vs Meta-Analysis",
        "subtitle": "A significant summary is not the same biology everywhere",
        "estimatedMinutes": 10,
        "learningObjectives": [
            "Distinguish within-ancestry estimates from fixed-effect and random-effects summaries.",
            "Read the weight each ancestry group receives, and explain why the fixed-effect summary ignores heterogeneity.",
            "Decide when a combined estimate is a fair biological claim for every group it combines.",
        ],
        "ancestryGroups": group_meta(group_ids, sizes, freqs),
        "prediction": {
            "pollId": "predict-within-vs-meta",
            "question": (
                f"Four ancestry groups are meta-analysed. Push heterogeneity to {max_het}%, "
                f"where the {largest_label} effect is about {effect_ratio} times the others'. "
                "What happens to the fixed-effect summary?"
            ),
            "options": [
                {"id": "stays-narrow", "label": "It stays narrow and significant"},
                {"id": "widens", "label": "Its interval widens like the random-effects one"},
                {"id": "non-significant", "label": "It stops being significant"},
                {"id": "flips", "label": "It flips sign"},
            ],
            "correctOptionId": meta_answer,
        },
        "controls": [
            {
                "id": "modelId",
                "label": "Evidence synthesis",
                "type": "select",
                "default": "fixed_meta",
                "values": [
                    {"value": "within", "label": "Within-ancestry"},
                    {"value": "fixed_meta", "label": "Fixed-effect meta-analysis"},
                    {"value": "random_meta", "label": "Random-effects meta-analysis"},
                ],
            },
            {
                "id": "heterogeneity",
                "label": "Effect heterogeneity across ancestries (%)",
                "type": "slider",
                "default": default_het,
                "min": 0,
                "max": 100,
                "step": 10,
            },
        ],
        "variant": {
            "rsid": variant.rsid,
            "gene": variant.gene,
            "locus": variant.locus,
            "trait": variant.trait,
        },
        "alleleFrequencies": [
            {"variantId": variant.rsid, "groupId": g, "af": r2(freqs[g])} for g in group_ids
        ],
        "simulatedEffects": [
            {
                "variantId": variant.rsid,
                "groupId": g,
                "beta": dispersed_beta[g],
                "mechanism": "Ancestry-varying LD and exposure context",
            }
            for g in group_ids
        ],
        "associationResults": assoc_at_default,
        "powerEstimates": [
            {
                "modelId": "within",
                "groupId": g,
                "n": sizes[g],
                "effectSize": dispersed_beta[g],
                "power": r2(
                    power(dispersed_beta[g], standard_error(sizes[g], freqs[g]), ALPHA_LOCUS)
                ),
            }
            for g in group_ids
        ],
        "interpretation": {
            "prompt": (
                "Does a significant meta-analysis mean the same biology is operating in "
                "every ancestry group?"
            ),
            "whatChanged": (
                "The fixed-effect summary stays narrow and significant at every level of "
                "heterogeneity because its weights never change: they are set by precision "
                "alone, so the two largest groups carry about three quarters of the weight and "
                f"the {largest_label} group, where the effect is about {effect_ratio} times "
                "larger, carries about a seventh. The random-effects model lets tau² re-balance "
                "the weights toward "
                "equality and its interval widens to say so. Only within-ancestry testing "
                "reports the East Asian effect itself."
            ),
            "whyItMatters": (
                "A meta-analysis summary describes the groups that carry its weight. When the "
                "distinctive biology sits in a small group, the combined p-value can be "
                "impressive while saying nothing about that group; equity-aware synthesis "
                "reports the weights, the heterogeneity, and the within-ancestry estimates, "
                "not only the strongest combined p-value."
            ),
            "facilitatorNote": (
                "Switch the synthesis select through its three settings before touching the "
                "slider: within-ancestry reports four estimates and four p-values; each "
                "meta-analysis reports one diamond, one p-value, and prints the weight each "
                "group carried on its row. Then set heterogeneity to 0: the two summaries "
                "coincide and I² is near zero. Move to 100. The fixed-effect weights do not "
                "move, the summary stays narrow and significant, and the rows show why: the "
                f"{largest_label} group with the {effect_ratio}-fold effect carries about 15% "
                "of the weight. This is the meta-analysis half of the Sirugo quote "
                "on the framing slides (diverse populations 'only as part of large "
                "meta-analyses'), and it is also what Tractor-style local-ancestry analysis "
                "does after stratifying (module 3)."
            ),
        },
        "vizSummaries": {
            "forest": by_control("heterogeneity", forest_grid),
            "reported": by_control("heterogeneity", reported_grid),
            "heterogeneity": by_control("heterogeneity", het_grid),
            "discussionPrompts": [
                "Would you report this as one shared effect, heterogeneous evidence, or both?",
                "Which group needs more data before a biology claim is fair, and would more data change its weight?",
            ],
        },
        "provenance": provenance(
            variant_keys=["rs1229984"],
            alpha=ALPHA_LOCUS,
            synthetic=[
                "Group-specific effect sizes at full heterogeneity (0.05 / 0.06 / 0.22 / 0.08) "
                "are chosen to produce a realistic spread of I²; they are not published "
                "ADH1B effect estimates.",
                "The heterogeneity slider linearly interpolates each group's effect between "
                "the common mean and its dispersed value.",
            ],
            assumptions=[
                "Additive dosage model, Hardy-Weinberg equilibrium, continuous phenotype "
                "standardised to unit variance.",
                "Fixed-effect meta-analysis is inverse-variance weighted; random-effects "
                "uses the DerSimonian-Laird estimator of tau². The forest plot prints each "
                "group's share of 1/se² (fixed) or of 1/(se² + tau²) (random) under the "
                "selected summary.",
                f"Two-sided Wald tests at alpha = {ALPHA_LOCUS}.",
            ],
        ),
    }


# --------------------------------------------------------------------------------------
# scenarios 3 and 4 — local ancestry: when it helps, and what it costs
# --------------------------------------------------------------------------------------

# Local-ancestry backgrounds other than African keep this ratio of whatever share is left,
# so one slider moves the composition without inventing a second free parameter.
EUR_PART, AMR_PART = 0.31, 0.17

# Fixed in module 3: the module's contrast is between the African and European backgrounds,
# and a third free effect size would quadruple the grid for a background that is rarely
# decisive.
BETA_AMR = 0.03

LD_DECAY_KB = 180.0
WINDOW_KB = 400
REGIONAL_POSITIONS = 21
CAUSAL_POSITION = 11.86  # Mb, MTHFR

LOCAL_ANCESTRY_GROUPS = ["afr", "eur", "amr"]

# The same three models in both modules, by design: module 3 is the case where the extra
# parameters buy the locus, module 4 the case where they only cost. The labels are chart
# legend entries and poll options, so they stay short.
LOCAL_ANCESTRY_MODELS = {
    "global_pc": "Global ancestry PCs",
    "local_covariate": "Local ancestry covariate",
    "local_interaction": "Local ancestry interaction",
}

# Covariate counts per model: age, sex and ten PCs; plus two local-ancestry dosages; plus
# the per-background genotype terms of the interaction model.
LOCAL_ANCESTRY_COVARIATES = {"global_pc": 12, "local_covariate": 13, "local_interaction": 16}


def local_ancestry_shares(afr_percent: int) -> dict[str, float]:
    """Local-ancestry composition at a locus from the African share alone."""
    afr = afr_percent / 100.0
    rest = 1.0 - afr
    return {
        "afr": afr,
        "eur": rest * EUR_PART / (EUR_PART + AMR_PART),
        "amr": rest * AMR_PART / (EUR_PART + AMR_PART),
    }


def background_models(
    beta: dict[str, float],
    p: dict[str, float],
    freqs: dict[str, float],
    n: int,
    extra_covariates: int = 0,
    residual_sd: float = 1.0,
) -> dict[str, Any]:
    """Every number the three local-ancestry models produce for one parameter combination.

    ``extra_covariates`` and ``residual_sd`` are the covariate blocks a participant can add
    in module 4: each block costs its terms (k/n) and buys back whatever outcome variance
    it explains. The per-background slopes of the interaction model pay the extra terms'
    chance share against the whole cohort (they are fit once), not against the stratum.

    Each model is derived rather than asserted (and stated in both modules' provenance):

    ``global_pc``
        The marginal slope, ``sum(p_g f_g b_g) / sum(p_g f_g)``. Global PCs carry no
        locus-specific ancestry information, so they do not change it.
    ``local_covariate``
        Conditioning on the background leaves the within-background slope, weighted by
        genotype variance: ``sum(p_g f_g (1-f_g) b_g) / sum(p_g f_g (1-f_g))``. Its standard
        error pays for the genotype variance ancestry explains.
    ``local_interaction``
        One slope per background, tested jointly on three degrees of freedom.
    """
    group_ids = LOCAL_ANCESTRY_GROUPS
    f_bar = sum(p[g] * freqs[g] for g in group_ids)
    within = sum(p[g] * freqs[g] * (1.0 - freqs[g]) for g in group_ids)

    beta_global = sum(p[g] * freqs[g] * beta[g] for g in group_ids) / f_bar
    se_global = standard_error(
        n,
        f_bar,
        residual_sd=residual_sd,
        n_covariates=LOCAL_ANCESTRY_COVARIATES["global_pc"] + extra_covariates,
    )
    beta_covariate = sum(p[g] * freqs[g] * (1.0 - freqs[g]) * beta[g] for g in group_ids) / within
    se_covariate = standard_error(
        n,
        f_bar,
        residual_sd=residual_sd,
        n_covariates=LOCAL_ANCESTRY_COVARIATES["local_covariate"] + extra_covariates,
        # Conditioning on local ancestry identifies the effect from within-background
        # genotype variance only; the rest is the price of the adjustment.
        ancestry_r2=1.0 - within / (f_bar * (1.0 - f_bar)),
    )
    sizes = {g: int(n * p[g] / 10) * 10 for g in group_ids}
    strata = {
        g: (
            beta[g],
            standard_error(
                sizes[g],
                freqs[g],
                residual_sd=residual_sd,
                n_covariates=LOCAL_ANCESTRY_COVARIATES["local_interaction"],
                absorbed_r2=extra_covariates / n,
            ),
        )
        for g in group_ids
    }

    return {
        "shares": p,
        "sizes": sizes,
        "global": (beta_global, se_global, wald_p(beta_global, se_global)),
        "covariate": (beta_covariate, se_covariate, wald_p(beta_covariate, se_covariate)),
        "strata": strata,
        "joint_p": joint_wald_p(list(strata.values())),
        "ancestry_r2": 1.0 - within / (f_bar * (1.0 - f_bar)),
    }


def model_p_values(result: dict[str, Any]) -> dict[str, float]:
    return {
        "global_pc": result["global"][2],
        "local_covariate": result["covariate"][2],
        "local_interaction": result["joint_p"],
    }


def simplest_detecting(result: dict[str, Any]) -> str:
    """The first model, in increasing complexity, that reaches alpha.

    The order is module 3's question: a participant should reach for the interaction model
    when the simpler analyses cannot see the locus, not by default.
    """
    for model_id, p_value in model_p_values(result).items():
        if p_value < ALPHA_LOCUS:
            return model_id
    return "none"


def detection_rows(result: dict[str, Any]) -> list[dict]:
    """-log10(p) per model against the significance line, plus which model does best here.

    ``best`` is the lowest p-value, so the chart can say "best here: ..." and the verdict
    visibly changes hands as the parameters move — the "it depends" that both modules teach.
    """
    threshold = r2(-math.log10(ALPHA_LOCUS), 2)
    p_values = model_p_values(result)
    best = min(p_values, key=lambda model_id: p_values[model_id])
    return [
        {
            "label": LOCAL_ANCESTRY_MODELS[model_id],
            "modelId": model_id,
            "p": r_sig(p_value, 3),
            "minusLog10P": r2(-math.log10(max(p_value, 1e-300)), 2),
            "detected": bool(p_value < ALPHA_LOCUS),
            "best": model_id == best,
            "threshold": threshold,
        }
        for model_id, p_value in p_values.items()
    ]


def forest_rows(result: dict[str, Any]) -> list[dict]:
    """Per-background slopes of the interaction model, then the two single-slope models."""
    rows = [
        {
            "label": f"{GROUP_LABELS[g].split(' ancestry')[0]} background",
            "groupId": g,
            "modelId": "local_interaction",
            "kind": "group",
            "beta": r2(result["strata"][g][0]),
            "lower": r2(result["strata"][g][0] - 1.96 * result["strata"][g][1]),
            "upper": r2(result["strata"][g][0] + 1.96 * result["strata"][g][1]),
        }
        for g in LOCAL_ANCESTRY_GROUPS
    ]
    for key, model_id in (("global", "global_pc"), ("covariate", "local_covariate")):
        beta_value, se_value, _ = result[key]
        rows.append({
            "label": LOCAL_ANCESTRY_MODELS[model_id],
            "modelId": model_id,
            "kind": "summary",
            "beta": r2(beta_value),
            "lower": r2(beta_value - 1.96 * se_value),
            "upper": r2(beta_value + 1.96 * se_value),
        })
    return rows


def local_ancestry_model_assumptions() -> list[str]:
    """The model statements both modules carry in ``provenance.assumptions``."""
    return [
        "Global-PC model: slope = sum(p_g f_g b_g) / sum(p_g f_g), the marginal "
        "regression. Global principal components carry no locus-specific ancestry "
        "information, so they leave this slope unchanged.",
        "Local-ancestry-covariate model: slope = sum(p_g f_g (1-f_g) b_g) / "
        "sum(p_g f_g (1-f_g)), the within-background slope weighted by genotype "
        "variance; its standard error subtracts the genotype variance that ancestry "
        "explains.",
        "Local-ancestry-interaction model: one slope per background, with standard "
        "errors from the background's sample size and allele frequency, tested "
        "jointly on three degrees of freedom. This is the local-ancestry-deconvolved "
        "(Tractor-style) regression, reduced to a single locus.",
        f"Covariate counts: {LOCAL_ANCESTRY_COVARIATES['global_pc']} (age, sex, ten PCs), "
        f"{LOCAL_ANCESTRY_COVARIATES['local_covariate']} (plus local-ancestry dosage), and "
        f"{LOCAL_ANCESTRY_COVARIATES['local_interaction']} (plus per-background genotype "
        "terms); each absorbs k/n of the genotype variance by chance.",
    ]


def scenario_global_vs_local() -> dict[str, Any]:
    """A locus whose story depends on how ancestry enters the model — and on the room.

    The variant is common on every ancestral background, so a pooled GWAS is well powered.
    What differs by local ancestry is the *effect*: the tag SNP can sit in opposite LD phase
    with the untyped causal allele on different haplotypes, so the apparent direction flips
    and the pooled estimate averages the two towards zero.

    Participants set the two background-specific effects, the local-ancestry composition at
    the locus, and the study size, and every combination is precomputed here. Three claims
    are reachable and all three are true of real analyses:

    - opposite effects: only the interaction model detects the locus;
    - the same effect on both backgrounds, despite different allele frequencies: the plain
      scan wins, because the interaction model pays for its extra parameters in degrees of
      freedom;
    - local ancestry as a *covariate* rarely rescues anything, because the problem is effect
      modification rather than confounding.

    The three models are ``background_models``; module 4 uses the same three.
    """
    variant = VARIANTS["rs1801133"]
    group_ids = LOCAL_ANCESTRY_GROUPS
    freqs = {g: variant.frequencies[g] for g in group_ids}

    beta_values = [r2(-0.12 + 0.04 * step) for step in range(7)]
    share_values = list(range(20, 90, 10))  # % African local ancestry at the locus
    size_values = [5_000, 15_000, 50_000]

    default_beta_afr, default_beta_eur = 0.12, -0.08
    default_share, default_size = 50, 15_000
    same_beta = 0.08

    def fit(beta_afr: float, beta_eur: float, afr_percent: int, n: int) -> dict[str, Any]:
        return background_models(
            {"afr": beta_afr, "eur": beta_eur, "amr": BETA_AMR},
            local_ancestry_shares(afr_percent),
            freqs,
            n,
        )

    # The positions and the significance line are identical in all 1,029 cells, so they are
    # emitted once as flat series and each cell carries only the three curves. Repeating them
    # per row was most of a 6 MB bundle; columnar it is 1.3 MB.
    half_mb = WINDOW_KB / 2.0 / 1000.0
    regional_positions = [
        r2(float(position), 4)
        for position in np.linspace(
            CAUSAL_POSITION - half_mb, CAUSAL_POSITION + half_mb, REGIONAL_POSITIONS
        )
    ]
    regional_threshold = r2(-math.log10(ALPHA_LOCUS / max(1, int(WINDOW_KB / 5))), 2)

    def regional_series(result: dict[str, Any]) -> list[dict]:
        """-log10(p) along the locus per model; tag markers carry an LD-attenuated signal.

        One row of three equal-length columns, aligned index-for-index with
        ``vizSummaries.regionalPositions``.
        """
        columns: dict[str, list[float]] = {
            "global_pc": [],
            "local_covariate": [],
            "local_interaction": [],
        }
        for position in regional_positions:
            r = math.exp(-abs(position - CAUSAL_POSITION) * 1000.0 / LD_DECAY_KB)
            joint = joint_wald_p([(beta * r, se) for beta, se in result["strata"].values()])
            columns["global_pc"].append(
                r2(-math.log10(max(wald_p(result["global"][0] * r, result["global"][1]), 1e-300)), 2)
            )
            columns["local_covariate"].append(
                r2(-math.log10(max(wald_p(result["covariate"][0] * r, result["covariate"][1]), 1e-300)), 2)
            )
            columns["local_interaction"].append(r2(-math.log10(max(joint, 1e-300)), 2))
        return [columns]

    regional_grid: dict[tuple, list[dict]] = {}
    detection_grid: dict[tuple, list[dict]] = {}
    forest_grid: dict[tuple, list[dict]] = {}
    for beta_afr in beta_values:
        for beta_eur in beta_values:
            for share in share_values:
                for size in size_values:
                    result = fit(beta_afr, beta_eur, share, size)
                    key = (beta_afr, beta_eur, share, size)
                    regional_grid[key] = regional_series(result)
                    detection_grid[key] = detection_rows(result)
                    forest_grid[key] = forest_rows(result)

    # Composition, not a track across position: admixture tracts from recent admixture span
    # megabases, so local ancestry does not vary across the 400 kb window this module shows.
    composition_grid = {
        share: [
            {
                "label": f"{GROUP_LABELS[g].split(' ancestry')[0]} local ancestry",
                "groupId": g,
                "proportion": r2(local_ancestry_shares(share)[g]),
            }
            for g in group_ids
        ]
        for share in share_values
    }

    default = fit(default_beta_afr, default_beta_eur, default_share, default_size)
    correct_option = simplest_detecting(default)

    # Read the output, not the exit code (analysis/README.md). These guard the module's
    # thesis: a default that the plain scan can see teaches the opposite lesson, and the
    # committed prediction would be scored against an answer nobody intended.
    if correct_option != "local_interaction":
        raise SystemExit(
            f"global-vs-local default no longer needs the interaction model "
            f"(simplest detecting model: {correct_option})"
        )
    if default["global"][2] < 0.3 or default["covariate"][2] < 0.3:
        raise SystemExit(
            "global-vs-local default is too close to significance for the simpler models: "
            f"p_global={default['global'][2]:.3f}, p_covariate={default['covariate'][2]:.3f}"
        )
    same_direction = simplest_detecting(fit(same_beta, same_beta, default_share, default_size))
    if same_direction != "global_pc":
        raise SystemExit(
            "global-vs-local same-effect preset no longer favours the plain scan "
            f"(simplest detecting model: {same_direction})"
        )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scenarioId": "global-vs-local-ancestry",
        "title": "Global vs Local Ancestry Modeling",
        "subtitle": "When locus-specific ancestry changes the story, and when it does not",
        "estimatedMinutes": 10,
        "learningObjectives": [
            "Differentiate global ancestry adjustment from local ancestry-informed modeling.",
            "Predict that local ancestry buys power only when the effect differs between backgrounds.",
            "Explain why the global scan wins when the effect is similar, even if allele frequencies differ.",
        ],
        "ancestryGroups": [
            {
                "id": gid,
                "label": f"{GROUP_LABELS[gid].split(' ancestry')[0]} local ancestry",
                "color": GROUP_COLORS[gid],
                "n": default["sizes"][gid],
                "af": r2(freqs[gid]),
            }
            for gid in group_ids
        ],
        "prediction": {
            "pollId": "predict-global-vs-local-ancestry",
            # States its premise, derived from the defaults, so the room can reason about it.
            "question": (
                "The tag SNP has opposite effects on African- and European-ancestry haplotypes "
                f"({default_beta_afr:+.2f} and {default_beta_eur:+.2f}) in a {default_size:,}-person "
                "admixed study. Which is the simplest analysis that detects it at p < 0.05?"
            ),
            "options": [
                {"id": "global_pc", "label": "Global ancestry PCs"},
                {"id": "local_covariate", "label": "Adding local ancestry as a covariate"},
                {"id": "local_interaction", "label": "Local ancestry interaction"},
                {"id": "none", "label": "None at this sample size"},
            ],
            # Computed from the precomputed p-values at the default setting, never typed in.
            "correctOptionId": correct_option,
        },
        "controls": [
            {
                "id": "modelId",
                "label": "Model adjustment",
                "type": "select",
                "default": "global_pc",
                "values": [{"value": mid, "label": label} for mid, label in LOCAL_ANCESTRY_MODELS.items()],
            },
            {
                "id": "betaAfr",
                "label": "Effect on African-ancestry haplotypes",
                "type": "slider",
                "default": default_beta_afr,
                "min": min(beta_values),
                "max": max(beta_values),
                "step": 0.04,
            },
            {
                "id": "betaEur",
                "label": "Effect on European-ancestry haplotypes",
                "type": "slider",
                "default": default_beta_eur,
                "min": min(beta_values),
                "max": max(beta_values),
                "step": 0.04,
            },
            {
                "id": "afrShare",
                "label": "African local ancestry at this locus (%)",
                "type": "slider",
                "default": default_share,
                "min": min(share_values),
                "max": max(share_values),
                "step": 10,
            },
            {
                "id": "totalN",
                "label": "Study size",
                "type": "select",
                "default": str(default_size),
                "values": [{"value": str(size), "label": f"{size:,} participants"} for size in size_values],
            },
        ],
        "presets": [
            {
                "id": "opposite",
                "label": "Opposite effects",
                "description": "Opposite LD phase on African and European haplotypes; the pooled estimate cancels and only the interaction model sees the locus.",
                "state": {
                    "betaAfr": default_beta_afr,
                    "betaEur": default_beta_eur,
                    "afrShare": default_share,
                    "totalN": str(default_size),
                },
            },
            {
                "id": "same-direction",
                "label": "Same effect, different frequency",
                "description": (
                    f"The same {same_beta:+.2f} effect on both backgrounds although the allele frequency "
                    f"differs ({freqs['afr']:.2f} African vs {freqs['eur']:.2f} European); the plain scan "
                    "wins, because local ancestry has nothing to add and the extra parameters cost power."
                ),
                "state": {"betaAfr": same_beta, "betaEur": same_beta, "afrShare": default_share, "totalN": str(default_size)},
            },
            {
                "id": "african-only",
                "label": "One background only",
                "description": "An effect carried on African-ancestry haplotypes alone; the backgrounds differ, so local ancestry helps.",
                "state": {"betaAfr": 0.12, "betaEur": 0.0, "afrShare": default_share, "totalN": str(default_size)},
            },
            {
                "id": "underpowered",
                "label": "Too small to tell",
                "description": "The same opposing effects in a study a third of the size; no model sees the locus.",
                "state": {
                    "betaAfr": default_beta_afr,
                    "betaEur": default_beta_eur,
                    "afrShare": default_share,
                    "totalN": str(size_values[0]),
                },
            },
        ],
        "variant": {
            "rsid": variant.rsid,
            "gene": variant.gene,
            "locus": variant.locus,
            "trait": variant.trait,
        },
        "alleleFrequencies": [
            {"variantId": variant.rsid, "groupId": g, "af": r2(freqs[g])} for g in group_ids
        ],
        "simulatedEffects": [
            {
                "variantId": variant.rsid,
                "groupId": "afr",
                "beta": default_beta_afr,
                "mechanism": "Participant-set: LD phase with the causal allele on African haplotypes",
            },
            {
                "variantId": variant.rsid,
                "groupId": "eur",
                "beta": default_beta_eur,
                "mechanism": "Participant-set: opposite LD phase on European haplotypes at the default setting",
            },
            {
                "variantId": variant.rsid,
                "groupId": "amr",
                "beta": BETA_AMR,
                "mechanism": "Fixed: mixed haplotype background; effect largely cancels",
            },
        ],
        "associationResults": [
            {
                "modelId": "global_pc",
                "variantId": variant.rsid,
                "beta": r2(default["global"][0]),
                "se": r2(default["global"][1]),
                "p": default["global"][2],
            },
            {
                "modelId": "local_covariate",
                "variantId": variant.rsid,
                "beta": r2(default["covariate"][0]),
                "se": r2(default["covariate"][1]),
                "p": default["covariate"][2],
            },
            *[
                {
                    "modelId": "local_interaction",
                    "variantId": variant.rsid,
                    "groupId": g,
                    "beta": r2(default["strata"][g][0]),
                    "se": r2(default["strata"][g][1]),
                    "p": wald_p(*default["strata"][g]),
                }
                for g in group_ids
            ],
        ],
        "powerEstimates": [
            {
                "modelId": "global_pc",
                "n": default_size,
                "effectSize": r2(default["global"][0]),
                "power": r2(power(default["global"][0], default["global"][1], ALPHA_LOCUS)),
            },
            {
                "modelId": "local_covariate",
                "n": default_size,
                "effectSize": r2(default["covariate"][0]),
                "power": r2(power(default["covariate"][0], default["covariate"][1], ALPHA_LOCUS)),
            },
            *[
                {
                    "modelId": "local_interaction",
                    "groupId": g,
                    "n": default["sizes"][g],
                    "effectSize": r2(default["strata"][g][0]),
                    "power": r2(power(*default["strata"][g], ALPHA_LOCUS)),
                }
                for g in group_ids
            ],
        ],
        "localAncestryResults": [
            {
                "locusId": variant.locus,
                "position": r2(CAUSAL_POSITION, 2),
                "ancestryState": g,
                "beta": r2(default["strata"][g][0]),
                "p": wald_p(*default["strata"][g]),
            }
            for g in group_ids
        ],
        "interpretation": {
            "prompt": "Does modelling local ancestry at this locus buy power, cost power, or neither?",
            "whatChanged": (
                "With opposing effects the standard scan reports nothing at this locus: the "
                "pooled estimate averages the two directions to near zero. Adding local "
                "ancestry as a covariate does not rescue it, because the problem is effect "
                "modification rather than confounding. Only the interaction model, which fits "
                "one slope per background and combines them, separates the backgrounds. Set "
                "both effects the same and the verdict reverses: the plain scan wins even "
                f"though the allele frequency differs ({freqs['afr']:.2f} vs {freqs['eur']:.2f}), "
                "because local ancestry has nothing to add and the interaction model pays for "
                "its extra parameters in degrees of freedom."
            ),
            "whyItMatters": (
                "Local-ancestry modelling is stratify-then-combine (Tractor), the same choice "
                "as modules 1 and 2 made at one locus. It buys power only when the effect "
                "genuinely differs between ancestry backgrounds; when the effect is similar, "
                "global ancestry adjustment is the better analysis even if the allele frequency "
                "is not. There is no one right way, and a null from the wrong model is not the "
                "same as no biology."
            ),
            "facilitatorNote": (
                "Collect the prediction before anyone touches a control, then project the "
                "room's split. The middle option is the intuitive one and it is wrong: local "
                "ancestry as a covariate does almost nothing here, because the backgrounds "
                "disagree rather than confound. The interaction model is the Tractor idea from "
                "the framing slides: stratify the genotype by local ancestry, estimate one "
                "effect per background, then combine, which is module 1's stratified analysis "
                "and module 2's meta-analysis done at a single locus. Then send them to the "
                "presets. 'Same effect, different frequency' is the one that surprises people "
                "who have just learned to reach for the interaction model: the frequencies "
                "differ three-fold, the effects agree, and the plain scan wins. Say the "
                "take-home out loud: local ancestry improves power only when the effect differs "
                "between populations; when it is similar, global ancestry is better even with "
                "different allele frequencies; there is no one right way. Watch the 'best "
                "here' line on the detection panel change hands as they move the sliders. "
                "Module 4 is the cost side of this trade-off at small sample sizes."
            ),
        },
        "vizSummaries": {
            "detection": by_controls(
                ["betaAfr", "betaEur", "afrShare", "totalN"],
                {(a, e, s, str(n)): rows for (a, e, s, n), rows in detection_grid.items()},
            ),
            "regional": by_controls(
                ["betaAfr", "betaEur", "afrShare", "totalN"],
                {(a, e, s, str(n)): rows for (a, e, s, n), rows in regional_grid.items()},
            ),
            "regionalPositions": [{"positions": regional_positions}],
            "regionalThreshold": [{"value": regional_threshold}],
            "forest": by_controls(
                ["betaAfr", "betaEur", "afrShare", "totalN"],
                {(a, e, s, str(n)): rows for (a, e, s, n), rows in forest_grid.items()},
            ),
            "localAncestryComposition": by_control("afrShare", composition_grid),
            "discussionPrompts": [
                "Is local ancestry a confounder, an effect modifier, or neither at this locus?",
                "Which setting would make you distrust a published pooled estimate at this locus?",
                "Would you choose the model before seeing the data, and what would you need to know to choose?",
            ],
        },
        "provenance": provenance(
            variant_keys=["rs1801133"],
            alpha=ALPHA_LOCUS,
            synthetic=[
                "Background-specific effect sizes are set by the participant over "
                f"{min(beta_values)} to {max(beta_values)} phenotype SD per allele "
                f"(default {default_beta_afr:+} African, {default_beta_eur:+} European); they "
                "are not published MTHFR effect estimates.",
                f"The Admixed American background is fixed at {BETA_AMR:+} phenotype SD "
                "per allele, and the non-African local ancestry share keeps a "
                f"{EUR_PART}:{AMR_PART} European-to-Admixed American ratio.",
                f"Local ancestry at the locus ({min(share_values)}-{max(share_values)}% African) "
                f"and the {LD_DECAY_KB:.0f} kb LD decay constant are illustrative.",
            ],
            assumptions=[
                "Additive dosage model, Hardy-Weinberg equilibrium, continuous phenotype "
                "standardised to unit variance.",
                "Effects are per local-ancestry background: a tag SNP in opposite LD phase "
                "with an untyped causal variant carries opposite signs on different "
                "ancestral haplotypes.",
                *local_ancestry_model_assumptions(),
                "Local ancestry is constant across the displayed window: admixture tracts "
                "from recent admixture span megabases, not the 400 kb shown here.",
                "Tag markers carry the signal attenuated by exp(-distance / "
                f"{LD_DECAY_KB:.0f} kb).",
                f"Two-sided Wald tests at alpha = {ALPHA_LOCUS}; the regional threshold line "
                "is Bonferroni-corrected for the markers in the displayed window.",
            ],
        ),
    }


def scenario_complexity_power() -> dict[str, Any]:
    """Local ancestry as a cost: module 3's three models at a locus that cannot tell them apart.

    The effect is the same on every ancestry background and the allele frequencies are
    similar, so there is nothing for local ancestry to correct and nothing for it to
    separate. The three models then differ only in what they pay: the covariate model a
    little genotype variance, the interaction model two extra degrees of freedom. Across the
    sample-size slider the same effect crosses significance at a different n under each,
    which is the false-negative lesson — and the cost falls hardest exactly where samples are
    smallest.
    """
    variant = VARIANTS["rs7412"]
    group_ids = LOCAL_ANCESTRY_GROUPS
    freqs = {g: variant.frequencies[g] for g in group_ids}

    # Synthetic, declared: one shared effect. The variant's frequencies are similar across
    # backgrounds, so local ancestry explains almost no genotype variance at this locus.
    shared_beta = 0.24
    betas = {g: shared_beta for g in group_ids}

    # The same admixed composition as module 3's default, so the two modules differ in the
    # locus and nothing else.
    afr_share = 50
    shares = local_ancestry_shares(afr_share)

    size_values = list(range(250, 1250, 50))
    default_size = 500

    # Covariate blocks a participant can add, named for what they are in an LDL analysis.
    # Each costs its terms (k/n of genotype variance, by chance) and buys back the outcome
    # variance it explains. Clinical covariates explain a lot of LDL for three terms;
    # genotyping batch, site, and plate indicators explain almost nothing for sixty.
    blocks = {
        "clinical": {
            "label": "Clinical covariates (BMI, smoking, statin use: 3 terms)",
            "k": 3,
            "outcome_r2": 0.20,
        },
        "technical": {
            "label": "Technical covariates (genotyping batch, site, plate: 60 terms)",
            "k": 60,
            "outcome_r2": 0.02,
        },
    }
    block_ids = list(blocks)
    toggle_states = [(False, False), (True, False), (False, True), (True, True)]

    def fit(n: int, clinical: bool, technical: bool) -> dict[str, Any]:
        active = [bid for bid, on in zip(block_ids, (clinical, technical)) if on]
        extra = sum(blocks[bid]["k"] for bid in active)
        explained = sum(blocks[bid]["outcome_r2"] for bid in active)
        return background_models(
            betas, shares, freqs, n, extra_covariates=extra, residual_sd=math.sqrt(1.0 - explained)
        )

    detection_grid: dict[tuple, list[dict]] = {}
    forest_grid: dict[tuple, list[dict]] = {}
    power_grid: dict[tuple, list[dict]] = {}
    results: dict[tuple, dict[str, Any]] = {}

    def model_power(result: dict[str, Any]) -> dict[str, float]:
        return {
            "global_pc": power(result["global"][0], result["global"][1], ALPHA_LOCUS),
            "local_covariate": power(result["covariate"][0], result["covariate"][1], ALPHA_LOCUS),
            # A joint test on three degrees of freedom: the same non-centrality spread
            # thinner, which is the whole cost of the interaction model here.
            "local_interaction": joint_power(list(result["strata"].values()), ALPHA_LOCUS),
        }

    for n_study in size_values:
        for clinical, technical in toggle_states:
            key = (n_study, clinical, technical)
            result = fit(n_study, clinical, technical)
            results[key] = result
            detection_grid[key] = detection_rows(result)
            forest_grid[key] = forest_rows(result)
            curve = []
            for n in sorted({250, 500, 1000, 1200, n_study}):
                for model_id, value in model_power(fit(n, clinical, technical)).items():
                    curve.append(
                        {
                            "label": LOCAL_ANCESTRY_MODELS[model_id],
                            "modelId": model_id,
                            "n": n,
                            "selected": n == n_study,
                            "power": r2(value),
                        }
                    )
            power_grid[key] = curve

    default_key = (default_size, False, False)
    default = results[default_key]

    def p_of(key: tuple, model_id: str) -> float:
        return next(row for row in detection_grid[key] if row["modelId"] == model_id)["p"]

    # Derived from the detection rows at the default, so the answer cannot drift from what
    # the chart draws.
    detected = {row["modelId"] for row in detection_grid[default_key] if row["detected"]}
    if detected == set(LOCAL_ANCESTRY_MODELS):
        complexity_answer = "all-three"
    elif detected == {"global_pc", "local_covariate"}:
        complexity_answer = "global-and-covariate"
    elif detected == {"global_pc"}:
        complexity_answer = "global-only"
    elif not detected:
        complexity_answer = "none"
    else:
        raise SystemExit(
            f"complexity-power detection set has no prediction option: {sorted(detected)}"
        )
    if complexity_answer != "global-and-covariate":
        raise SystemExit(
            "complexity-power default no longer separates the interaction model from the "
            f"single-slope models (answer: {complexity_answer})"
        )
    # The convergence half of the lesson: at the top of the slider the cost is gone.
    if any(not row["detected"] for row in detection_grid[(max(size_values), False, False)]):
        raise SystemExit(
            "complexity-power: a model still misses the locus at the largest sample size, so "
            "the slider no longer shows the models converging"
        )
    # The covariate blocks must pull in opposite directions at the default, or the toggles
    # teach "covariates are covariates" rather than "it depends what they explain".
    p_default = p_of(default_key, "global_pc")
    p_clinical = p_of((default_size, True, False), "global_pc")
    p_technical = p_of((default_size, False, True), "global_pc")
    if not p_clinical < p_default < p_technical:
        raise SystemExit(
            "complexity-power: the clinical block no longer helps and the technical block no "
            f"longer costs at the default (p = {p_clinical}, {p_default}, {p_technical})"
        )

    # The sample size at which each model first detects the locus, read off the grid.
    crossing = {
        model_id: next(
            n for n in size_values
            if next(row for row in detection_grid[(n, False, False)] if row["modelId"] == model_id)["detected"]
        )
        for model_id in LOCAL_ANCESTRY_MODELS
    }
    smallest = min(size_values)
    p_small_default = p_of((smallest, False, False), "global_pc")
    p_small_technical = p_of((smallest, False, True), "global_pc")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scenarioId": "complexity-power",
        "title": "Local Ancestry and Model Complexity",
        "subtitle": "When the extra parameters only cost power",
        "estimatedMinutes": 10,
        "learningObjectives": [
            "Recognize local-ancestry terms as parameters, and parameters as a cost that falls hardest on small samples.",
            "Predict when a local-ancestry model adds nothing: similar effects and similar frequencies across backgrounds.",
            "Explain why the same modelling choice is free in a large cohort and decisive in a small one.",
        ],
        "ancestryGroups": [
            {
                "id": gid,
                "label": f"{GROUP_LABELS[gid].split(' ancestry')[0]} local ancestry",
                "color": GROUP_COLORS[gid],
                "n": default["sizes"][gid],
                "af": r2(freqs[gid]),
            }
            for gid in group_ids
        ],
        "prediction": {
            "pollId": "predict-complexity-power",
            "question": (
                "At this locus the effect is the same on every ancestry background and the "
                f"allele frequencies are similar. In an admixed study of {default_size} people "
                "adjusted for age, sex and ten global PCs, which of global ancestry PCs alone, "
                "adding a local-ancestry covariate, and the local-ancestry interaction model "
                "detect it at p < 0.05?"
            ),
            "options": [
                {"id": "all-three", "label": "All three"},
                {"id": "global-and-covariate", "label": "Global PCs and the local-ancestry covariate, but not the interaction model"},
                {"id": "global-only", "label": "Global ancestry PCs only"},
                {"id": "none", "label": "None of them"},
            ],
            "correctOptionId": complexity_answer,
        },
        "controls": [
            {
                "id": "modelId",
                "label": "Ancestry adjustment",
                "type": "select",
                "default": "global_pc",
                "values": [{"value": mid, "label": label} for mid, label in LOCAL_ANCESTRY_MODELS.items()],
            },
            *[
                {"id": bid, "label": spec["label"], "type": "toggle", "default": False}
                for bid, spec in blocks.items()
            ],
            {
                "id": "sampleSize",
                "label": "Admixed study size",
                "type": "slider",
                "default": default_size,
                "min": min(size_values),
                "max": max(size_values),
                "step": 50,
            },
        ],
        "variant": {
            "rsid": variant.rsid,
            "gene": variant.gene,
            "locus": variant.locus,
            "trait": variant.trait,
        },
        "alleleFrequencies": [
            {"variantId": variant.rsid, "groupId": g, "af": r2(freqs[g])} for g in group_ids
        ],
        "simulatedEffects": [
            {
                "variantId": variant.rsid,
                "groupId": g,
                "beta": shared_beta,
                "mechanism": "Shared effect on every background; allele frequencies are similar",
            }
            for g in group_ids
        ],
        "associationResults": [
            {
                "modelId": "global_pc",
                "variantId": variant.rsid,
                "beta": r2(default["global"][0]),
                "se": r2(default["global"][1]),
                "p": default["global"][2],
            },
            {
                "modelId": "local_covariate",
                "variantId": variant.rsid,
                "beta": r2(default["covariate"][0]),
                "se": r2(default["covariate"][1]),
                "p": default["covariate"][2],
            },
            *[
                {
                    "modelId": "local_interaction",
                    "variantId": variant.rsid,
                    "groupId": g,
                    "beta": r2(default["strata"][g][0]),
                    "se": r2(default["strata"][g][1]),
                    "p": wald_p(*default["strata"][g]),
                }
                for g in group_ids
            ],
        ],
        "powerEstimates": [
            {
                "modelId": model_id,
                "n": default_size,
                "effectSize": shared_beta,
                "power": r2(value),
            }
            for model_id, value in model_power(default).items()
        ],
        "interpretation": {
            "prompt": (
                "The effect is the same on every ancestry background. Does modelling local "
                "ancestry help, hurt, or neither?"
            ),
            "whatChanged": (
                "Every model estimates the same effect; only the uncertainty differs, and it "
                "differs by what each added term explains. Global PCs and the local-ancestry "
                "covariate are within a hair of each other, because the allele frequencies barely "
                f"differ by background, so local ancestry explains about {100 * default['ancestry_r2']:.1f}% "
                "of the genotype variance: nothing to correct, almost nothing to pay. The "
                "interaction model fits one slope per background and tests them jointly on three "
                f"degrees of freedom, so it first detects the locus near n={crossing['local_interaction']} "
                f"where the single-slope models cross near n={crossing['global_pc']}. The covariate "
                "switches show the other two cases: three clinical covariates take the global-PC "
                f"p-value from {p_default:.3f} to {p_clinical:.3f} at n={default_size}, because they explain a "
                f"fifth of LDL variance; sixty technical indicators move it to {p_technical:.3f}, and at "
                f"n={smallest} from {p_small_default:.3f} to {p_small_technical:.3f}, because they explain "
                "almost nothing and cost sixty terms."
            ),
            "whyItMatters": (
                "A term earns its place by what it explains. Clinical covariates explain the "
                "outcome and buy power; technical indicators explain little and cost k/n; local "
                "ancestry explains genotype variance, which is a cost unless the backgrounds "
                "differ; and an interaction model pays in degrees of freedom. Local ancestry can "
                "fail, not because the model is wrong but because complexity was added that the "
                "locus did not need, and every one of these prices falls hardest where the sample "
                "is smallest, which is exactly the admixed and underrepresented cohorts the "
                "method was built for. Module 3 shows when the extra parameters pay for "
                "themselves; this module shows what they cost when they do not."
            ),
            "facilitatorNote": (
                "Introduce from module 3: the same three models and the same admixed "
                "composition, but a locus where the backgrounds agree and the allele "
                f"frequencies are similar (APOE rs7412: {freqs['afr']:.2f} / {freqs['eur']:.2f} / "
                f"{freqs['amr']:.2f}). Park the slider at {default_size}: global PCs and the "
                "covariate model are significant with near-identical intervals, the interaction "
                "model is not, and every point estimate is the same. That is the module in one "
                "screen. The near-identical first two arms are deliberate and worth saying: a "
                "local-ancestry covariate is cheap and, here, useless; the interaction model is "
                "neither. Then the two switches: clinical covariates make every model more "
                "significant (they explain LDL), sixty technical indicators make every model "
                f"less significant, most at n={smallest}. Slide to {max(size_values):,} and all "
                "three models agree, which is why the same choice is free in a biobank and "
                "decisive in a small study. Then put the two modules together: there is no one "
                "right way, and the answer depends on whether the effect differs between "
                "backgrounds and on what each covariate actually explains, which you cannot "
                "know before you look."
            ),
        },
        "vizSummaries": {
            "detection": by_controls(["sampleSize", *block_ids], detection_grid),
            "forest": by_controls(["sampleSize", *block_ids], forest_grid),
            "powerCurve": by_controls(["sampleSize", *block_ids], power_grid),
            "discussionPrompts": [
                "What would you want to know about a locus before adding local-ancestry terms to its model?",
                "Which covariates in your own pipeline explain the outcome, and which are there by habit?",
                "Where does your own admixed cohort sit on this sample-size axis?",
                "How would you report, in a methods section, that the interaction model was tried and was underpowered?",
            ],
        },
        "provenance": provenance(
            variant_keys=["rs7412"],
            alpha=ALPHA_LOCUS,
            synthetic=[
                f"The shared effect size ({shared_beta} phenotype SD per allele on every "
                "background) is chosen for legibility; it is not a published APOE effect "
                "estimate.",
                f"The local-ancestry composition is fixed at module 3's default ({afr_share}% "
                f"African, with the remainder in a {EUR_PART}:{AMR_PART} European-to-Admixed "
                "American ratio), and the sample-size slider is the admixed study's n.",
                "Covariate blocks: clinical (BMI, smoking, statin use; 3 terms explaining 20% of "
                "LDL variance) and technical (genotyping batch, site, plate; 60 indicators "
                "explaining 2%). The term counts and explained variances are illustrative of a "
                "biobank LDL analysis, not drawn from a specific study; explained variances add.",
            ],
            assumptions=[
                "Additive dosage model, Hardy-Weinberg equilibrium, continuous phenotype "
                "standardised to unit variance.",
                *local_ancestry_model_assumptions(),
                "Power for the interaction model is that of the three-degree-of-freedom "
                "joint test (non-central chi-squared); for the single-slope models it is "
                "the two-sided Wald test.",
                "A covariate block costs k/n of the genotype variance by chance and shrinks "
                "the residual by the outcome variance it explains; the interaction model's "
                "per-background slopes pay the block's chance share against the whole cohort, "
                "since the covariates are fit once.",
                f"Two-sided tests at alpha = {ALPHA_LOCUS}.",
            ],
        ),
    }


# --------------------------------------------------------------------------------------
# scenario 5 — regularization and heterogeneous biology
# --------------------------------------------------------------------------------------


def scenario_regularization() -> dict[str, Any]:
    group_ids = ["afr", "eur", "amr"]
    sizes = cohort(3100, group_ids)
    # Three blocks of variant weights stand in for a polygenic weight vector: each block is a
    # set of variants whose weights transfer differently across ancestries (LD, allele
    # frequency, or genuinely different effect sizes).
    features = ["Weight block A", "Weight block B", "Weight block C"]

    # Synthetic, declared: ancestry-specific true weights per block. Block A carries most of
    # the signal in African ancestry; a score trained on the pooled cohort must average it
    # toward the largest group's weights.
    true_weights = {
        "afr": np.array([0.40, 0.18, 0.26]),
        "eur": np.array([0.14, 0.30, 0.09]),
        "amr": np.array([0.31, 0.22, 0.17]),
    }
    heritability = 0.36  # ceiling on achievable R²

    weight_n = {g: sizes[g] for g in group_ids}
    total_n = sum(weight_n.values())

    def shared_weights() -> np.ndarray:
        """Sample-size-weighted average: what a pooled model converges to."""
        return sum(weight_n[g] * true_weights[g] for g in group_ids) / total_n

    def soft_threshold(w: np.ndarray, lam: float) -> np.ndarray:
        """Lasso-style soft thresholding at penalty ``lam`` (0-1 scaled)."""
        return np.sign(w) * np.maximum(np.abs(w) - lam, 0.0)

    def alignment(w_model: np.ndarray, w_true: np.ndarray) -> float:
        """Squared cosine similarity: the fraction of the achievable signal captured."""
        denom = np.linalg.norm(w_model) * np.linalg.norm(w_true)
        if denom == 0:
            return 0.0
        return float((float(w_model @ w_true) / denom) ** 2)

    def calibration_score(w_model: np.ndarray, w_true: np.ndarray) -> float:
        """Calibration slope mapped to (0, 1]; 1.0 is a perfectly calibrated slope."""
        if np.linalg.norm(w_model) == 0:
            return 0.0
        slope = float(w_model @ w_true) / float(w_model @ w_model)
        if slope <= 0:
            return 0.0
        return float(math.exp(-abs(math.log(slope))))

    lambda_values = list(range(5, 95, 5))
    default_lambda = 45

    # How hard the penalty bites each arm, and what the group-aware arm pays for its extra
    # parameters. At 2.2 the strong arm was flat zero from a penalty of 35 upwards — half the
    # slider rendered as empty bars and p-values of exactly 1.0, which reads as a broken
    # chart rather than as over-shrinkage.
    group_aware_penalty = 0.7
    strong_penalty = 1.1
    # A group-aware model estimates each group's weights from that group's data alone, so the
    # signal it actually captures is discounted by n_g / (n_g + prior). Without this cost it
    # dominated the shared model on *every* metric at *every* penalty, and this module's
    # question — is slightly lower global R² worth better calibration? — described a tradeoff
    # its own numbers did not contain.
    group_aware_prior_n = 250

    def estimation_discount(model_id: str, group_id: str) -> float:
        if model_id != "group_aware":
            return 1.0
        return weight_n[group_id] / (weight_n[group_id] + group_aware_prior_n)

    def model_weights(model_id: str, lam_pct: float) -> dict[str, np.ndarray]:
        """Per-group coefficient vectors implied by a model at a given penalty."""
        lam = lam_pct / 100.0 * 0.35  # scale so the grid spans "barely" to "mostly" shrunk
        if model_id == "shared_sparse":
            w = soft_threshold(shared_weights(), lam)
            return {g: w for g in group_ids}
        if model_id == "group_aware":
            # Group-aware models shrink toward the shared solution rather than to zero,
            # so group-specific structure survives the penalty.
            shared = shared_weights()
            return {
                g: soft_threshold(
                    shared + 0.7 * (true_weights[g] - shared), lam * group_aware_penalty
                )
                for g in group_ids
            }
        if model_id == "strong_regularization":
            w = soft_threshold(shared_weights(), lam * strong_penalty)
            return {g: w for g in group_ids}
        raise KeyError(model_id)

    # Ids are stable (polls, tests, and the validator reference them); the labels are what
    # the deck calls these: a score trained on the pooled cohort, an ancestry-aware score,
    # and the pooled score under heavier shrinkage.
    models = {
        "shared_sparse": "Pooled-cohort PRS",
        "group_aware": "Ancestry-aware PRS",
        "strong_regularization": "Pooled PRS, strong shrinkage",
    }

    performance_grid: dict[int, list[dict]] = {}
    calibration_grid: dict[int, list[dict]] = {}

    for lam_pct in lambda_values:
        perf_rows = []
        for model_id, label in models.items():
            w = model_weights(model_id, lam_pct)
            global_r2 = (
                sum(
                    weight_n[g] * alignment(w[g], true_weights[g]) * estimation_discount(model_id, g)
                    for g in group_ids
                )
                / total_n
                * heritability
            )
            perf_rows.append(
                {"label": label, "modelId": model_id, "metric": "Global R²", "value": r2(global_r2)}
            )
        performance_grid[lam_pct] = perf_rows

        calib_rows = []
        for g in group_ids:
            row: dict[str, Any] = {"label": GROUP_LABELS[g]}
            for model_id in models:
                w = model_weights(model_id, lam_pct)
                row[model_id] = r2(calibration_score(w[g], true_weights[g]))
            calib_rows.append(row)
        calibration_grid[lam_pct] = calib_rows

    # Weight path per score, keyed by the score select so choosing a score changes the
    # panel. The pooled scores carry one weight vector for everyone; the ancestry-aware
    # score is shown for the smallest group, which is the group the module is about.
    smallest_group = min(group_ids, key=lambda g: sizes[g])
    coefficient_paths = {
        model_id: [
            {
                "lambda": lam_pct,
                **{
                    f: r2(float(model_weights(model_id, lam_pct)[smallest_group][i]))
                    for i, f in enumerate(features)
                },
            }
            for lam_pct in lambda_values
        ]
        for model_id in models
    }

    assoc = []
    for model_id, label in models.items():
        w = model_weights(model_id, default_lambda)
        for g in group_ids:
            # Report the block-A weight as the headline association.
            beta = float(w[g][0])
            se = standard_error(sizes[g], 0.30, n_covariates=len(features))
            assoc.append(
                {
                    "modelId": model_id,
                    "variantId": "prsBlockA",
                    "groupId": g,
                    "beta": r2(beta),
                    "se": r2(se),
                    "p": wald_p(beta, se) if beta != 0 else 1.0,
                }
            )

    # Derived: at the starting penalty, which model is best calibrated for the group with the
    # least data. That is the question the headline R² cannot answer.
    calibration_default = {
        model_id: r2(
            calibration_score(
                model_weights(model_id, default_lambda)[smallest_group],
                true_weights[smallest_group],
            )
        )
        for model_id in models
    }
    ranked = sorted(calibration_default.values(), reverse=True)
    regularization_answer = (
        "tied"
        if ranked[0] == ranked[1]
        else max(calibration_default, key=lambda mid: calibration_default[mid])
    )
    if regularization_answer != "group_aware":
        raise SystemExit(
            "regularization-heterogeneity no longer has the group-aware model best "
            f"calibrated for the smallest group (answer: {regularization_answer}, "
            f"calibration: {calibration_default})"
        )

    # And the tradeoff the module asks about has to exist in the numbers: the group-aware
    # model must actually give up global R² for that calibration.
    r2_default = {row["modelId"]: row["value"] for row in performance_grid[default_lambda]}
    if not r2_default["group_aware"] < r2_default["shared_sparse"]:
        raise SystemExit(
            "regularization-heterogeneity group-aware model no longer trades global R² for "
            f"subgroup calibration: {r2_default}"
        )

    shares_pct = {g: round(100 * sizes[g] / total_n) for g in group_ids}

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scenarioId": "regularization-heterogeneity",
        "title": "Polygenic Scores Across Ancestries",
        "subtitle": "The headline metric is not the whole story",
        "estimatedMinutes": 10,
        "learningObjectives": [
            "Compare a polygenic score trained on the pooled cohort with an ancestry-aware score on the metric each is judged by.",
            "Interpret a small loss in global accuracy as the price of calibration in the smallest ancestry group.",
            "Connect shrinkage strength to which score fails the smallest group first.",
        ],
        "ancestryGroups": [
            {
                "id": gid,
                "label": GROUP_LABELS[gid],
                "color": GROUP_COLORS[gid],
                "n": sizes[gid],
            }
            for gid in group_ids
        ],
        "prediction": {
            "pollId": "predict-regularization-heterogeneity",
            "question": (
                f"Three polygenic scores are trained on a cohort that is {shares_pct['eur']}% "
                f"European, {shares_pct['afr']}% African and {shares_pct['amr']}% Admixed American "
                "ancestry. At the starting shrinkage, which score is best calibrated in the "
                "smallest ancestry group?"
            ),
            "options": [
                {"id": "shared_sparse", "label": "The pooled-cohort PRS"},
                {"id": "group_aware", "label": "The ancestry-aware PRS"},
                {"id": "strong_regularization", "label": "The pooled PRS under strong shrinkage"},
                {"id": "tied", "label": "They are equally calibrated"},
            ],
            "correctOptionId": regularization_answer,
        },
        "controls": [
            {
                "id": "modelId",
                "label": "Polygenic score",
                "type": "select",
                "default": "shared_sparse",
                "values": [{"value": mid, "label": label} for mid, label in models.items()],
            },
            {
                "id": "lambda",
                "label": "Shrinkage (penalty)",
                "type": "slider",
                "default": default_lambda,
                "min": min(lambda_values),
                "max": max(lambda_values),
                "step": 5,
            },
        ],
        "alleleFrequencies": [],
        "simulatedEffects": [
            {
                "variantId": "prsBlockA",
                "groupId": g,
                "beta": r2(float(true_weights[g][0])),
                "mechanism": "Ancestry-specific true weight of variant block A",
            }
            for g in group_ids
        ],
        "associationResults": assoc,
        "powerEstimates": [
            {
                "modelId": model_id,
                "n": total_n,
                "effectSize": r2(float(model_weights(model_id, default_lambda)[group_ids[0]][0])),
                "power": r2(
                    power(
                        float(model_weights(model_id, default_lambda)[group_ids[0]][0]) or 1e-6,
                        standard_error(total_n, 0.30, n_covariates=len(features)),
                        ALPHA_LOCUS,
                    )
                ),
            }
            for model_id in models
        ],
        "modelPerformance": [
            {"modelId": model_id, "metric": "r2", "value": row["value"]}
            for model_id, row in zip(
                models, performance_grid[default_lambda]
            )
        ],
        "interpretation": {
            "prompt": (
                "A polygenic score trained on the pooled multi-ancestry cohort reports the "
                "higher global R². An ancestry-aware score is better calibrated in the "
                "smallest group. Which one is worse?"
            ),
            "whatChanged": (
                "The pooled-cohort PRS is trained on everyone at once, so its weights converge "
                "to the largest group's. The ancestry-aware PRS estimates each ancestry group's "
                "weights from that group's data and pays for the extra parameters in global R². "
                "What it buys is calibration: in the smallest group it is far better calibrated "
                "than the pooled score at the same shrinkage. Raise the shrinkage and the pooled "
                "score's calibration collapses first, while the ancestry-aware score still holds "
                "when the pooled one has shrunk to nothing."
            ),
            "whyItMatters": (
                "This is the multi-ancestry polygenic score result from the framing slides: the "
                "score trained on the pooled cohort wins on the headline metric for most groups "
                "and fails the group that made up a few percent of the training data. A single "
                "accuracy metric rewards fitting the largest group while under-serving smaller "
                "or heterogeneous ones, and it is built from pooled effect estimates like "
                "module 1's."
            ),
            "facilitatorNote": (
                "This is the African-ancestry exception on the multi-ancestry PRS slide. Read "
                "the two panels against each other at the starting shrinkage: the ancestry-aware "
                "PRS looks slightly worse on global R² and is markedly better for the smallest "
                "group. Then push the shrinkage to the maximum: the pooled score's weights go "
                "to zero while the ancestry-aware score is still predicting (switch the score "
                "select to see each one's weight path; the ancestry-aware path is drawn for the "
                f"{GROUP_LABELS[smallest_group]} group). A score chosen on "
                "the headline metric alone is the one that fails the smallest group first. The "
                "weight blocks are a three-block stand-in for a genome-wide weight vector, not "
                "named loci; say so if asked."
            ),
        },
        "vizSummaries": {
            "performanceCards": by_control("lambda", performance_grid),
            "calibration": by_control("lambda", calibration_grid),
            "coefficientPath": by_control("modelId", coefficient_paths),
            "discussionPrompts": [
                "Which metric would you choose if the score guides who gets screened?",
                "When should lower global accuracy trigger deeper evaluation by ancestry group?",
                "The pooled score was trained on a cohort that was a few percent African "
                "ancestry. What would you want reported before it is deployed in that group?",
            ],
        },
        "provenance": provenance(
            variant_keys=[],
            alpha=ALPHA_LOCUS,
            synthetic=[
                "The score is a three-block stand-in for a polygenic weight vector: each block "
                "is a set of variants whose true weights differ by ancestry (through LD, allele "
                "frequency, or effect size), with entirely synthetic weights.",
                "A heritability ceiling of 0.36 caps achievable R².",
            ],
            assumptions=[
                "Shrinkage is modelled as lasso-style soft thresholding of the weight vector.",
                "The pooled-cohort score converges to the sample-size-weighted average of the "
                "ancestry-specific weights; the ancestry-aware score shrinks toward that pooled "
                "solution rather than toward zero.",
                "The ancestry-aware score pays an estimation cost for fitting each group "
                "separately: the signal it captures in a group is discounted by "
                f"n / (n + {group_aware_prior_n}), so its advantage is smallest exactly where "
                "the data are thinnest. This is why its global R² sits below the shared "
                "model's while its subgroup calibration sits above it.",
                "R² is the achievable ceiling times the squared cosine similarity between "
                "fitted and true weights; calibration is the calibration slope mapped to "
                "(0, 1] via exp(-|log slope|).",
            ],
        ),
    }


# --------------------------------------------------------------------------------------
# scenario 6 — scalability and genome-wide feasibility
# --------------------------------------------------------------------------------------


def scenario_scalability() -> dict[str, Any]:
    """Why compute scale is an equity question, not a engineering footnote.

    The ancestry-aware analyses that help admixed cohorts are exactly the ones that cost
    the most compute, so a lab without accelerated infrastructure is pushed toward the
    cheap analysis that hides the signal.
    """
    # Hardware classes are Bridges-2 node types (Pittsburgh Supercomputing Center), plus
    # the laptop most of the room actually has. Bridges-2 publishes no hourly dollar rate:
    # it is free for research and education through NSF ACCESS allocations and charged in
    # service units (1 core-hour = 1 SU on Regular Memory nodes; 2 SU per GPU-hour on H100
    # nodes). The dollar figures are AWS and Google Cloud on-demand list prices for the
    # closest instance to each class, quoted on PRICE_QUOTE_DATE, with the Google Cloud CPU
    # instance pro-rated to 128 physical cores. The laptop's "price" is electricity.
    # Throughputs (variant-sample operations per second) are order-of-magnitude
    # illustrations; none of this is a benchmark or an invoice.
    cloud_prices = {
        # id: (provider label, instance, on-demand USD per hour, note)
        "aws": "AWS (us-east-1, on-demand)",
        "gcp": "Google Cloud (us-central1, on-demand)",
        "electricity": "Electricity (~70 W at $0.17/kWh)",
    }
    gcp_c3d_360 = 16.3436  # c3d-standard-360: 360 vCPU = 180 physical cores
    platforms = {
        "laptop": {
            "label": "Laptop (8 cores)",
            "throughput": 3e7,
            "su_per_hour": None,
            "prices": {
                "electricity": ("8-core laptop under load", 0.012),
                "aws": ("c7a.2xlarge, 8 cores", 0.41056),
                "gcp": ("c3d-standard-8, 8 vCPU", 0.3632),
            },
        },
        "cpu_single": {
            "label": "Bridges-2 RM node (128 cores)",
            "throughput": 5e8,
            "su_per_hour": 128.0,
            "prices": {
                "aws": ("c7a.32xlarge, 128 cores", 6.56896),
                "gcp": ("c3d-standard-360 pro-rated to 128 cores", round(gcp_c3d_360 * 128 / 180, 4)),
            },
        },
        "cpu_cluster": {
            "label": "Bridges-2 RM, 20 nodes (2,560 cores)",
            "throughput": 1e10,
            "su_per_hour": 20 * 128.0,
            "prices": {
                "aws": ("20 x c7a.32xlarge", 20 * 6.56896),
                "gcp": ("20 x c3d-standard-360 pro-rated to 128 cores", round(20 * gcp_c3d_360 * 128 / 180, 4)),
            },
        },
        "gpu": {
            "label": "Bridges-2 GPU node (8x H100-80GB)",
            "throughput": 2e11,
            "su_per_hour": 8 * 2.0,
            "prices": {
                "aws": ("p5.48xlarge, 8x H100", 55.04),
                "gcp": ("a3-highgpu-8g, 8x H100", 87.8325),
            },
        },
    }
    PRICE_QUOTE_DATE = "2026-10-14"
    ACCESS_EXPLORE_CREDITS = 400_000

    # Model families and how many variant-level tests each requires per variant.
    families = {
        "Standard GWAS scan": 1,
        "Local ancestry-aware scan": 4,
        "Permutation scan (interaction, 1,000 permutations)": 4000,
    }

    sample_count = 250_000
    # The question is asked on the single CPU node; the laptop and the accelerators are what
    # the select then compares it with.
    default_platform = "cpu_single"

    variant_values = list(range(2, 22, 2))  # millions of variants
    default_variants = 8

    runtime_grid: dict[int, list[dict]] = {}
    cost_grid: dict[int, list[dict]] = {}
    allocation_grid: dict[int, list[dict]] = {}

    for n_variants_m in variant_values:
        work_base = n_variants_m * 1_000_000 * sample_count
        runtime_rows = []
        cost_rows = []
        allocation_rows = []
        for platform_id, spec in platforms.items():
            for family, multiplier in families.items():
                hours = work_base * multiplier / spec["throughput"] / 3600.0
                runtime_rows.append(
                    {
                        "label": family,
                        "platformId": platform_id,
                        "platform": spec["label"],
                        "hours": r_sig(hours),
                    }
                )
                for provider, (instance, usd_per_hour) in spec["prices"].items():
                    cost_rows.append(
                        {
                            "label": family,
                            "platformId": platform_id,
                            "platform": spec["label"],
                            "provider": provider,
                            "providerLabel": cloud_prices[provider],
                            "instance": instance,
                            "usd": r_sig(hours * usd_per_hour),
                        }
                    )
                if spec["su_per_hour"] is not None:
                    allocation_rows.append(
                        {
                            "label": family,
                            "platformId": platform_id,
                            "platform": spec["label"],
                            "su": r_sig(hours * spec["su_per_hour"]),
                        }
                    )
        runtime_grid[n_variants_m] = runtime_rows
        cost_grid[n_variants_m] = cost_rows
        allocation_grid[n_variants_m] = allocation_rows

    # Feasibility within a one-week turnaround, the practical bar for iterative analysis.
    # Keyed by the variant slider like the other two charts: a feasibility panel that stayed
    # fixed at 8 million while the runtime bars moved was a control with no consequence on
    # the one chart that states the verdict.
    week_hours = 168
    feasibility_grid: dict[int, list[dict]] = {}
    for n_variants_m in variant_values:
        rows = []
        for platform_id, spec in platforms.items():
            for family, multiplier in families.items():
                hours = n_variants_m * 1_000_000 * sample_count * multiplier / spec["throughput"] / 3600.0
                rows.append(
                    {
                        "platform": spec["label"],
                        "platformId": platform_id,
                        "analysis": family,
                        "hours": r_sig(hours),
                        "feasible": bool(hours <= week_hours),
                    }
                )
        feasibility_grid[n_variants_m] = rows

    # Derived from the feasibility rows for the platform and variant count the module opens
    # on, so the answer moves if the throughput figures or the one-week bar ever change.
    feasible_here = {
        row["analysis"]
        for row in feasibility_grid[default_variants]
        if row["platformId"] == default_platform and row["feasible"]
    }
    if feasible_here == set(families):
        scalability_answer = "all-three"
    elif feasible_here == {"Standard GWAS scan", "Local ancestry-aware scan"}:
        scalability_answer = "standard-and-local"
    elif feasible_here == {"Standard GWAS scan"}:
        scalability_answer = "standard-only"
    elif not feasible_here:
        scalability_answer = "none"
    else:
        raise SystemExit(
            f"scalability-equity feasible set has no prediction option: {sorted(feasible_here)}"
        )
    if scalability_answer != "standard-and-local":
        raise SystemExit(
            "scalability-equity default no longer puts the interaction scan out of reach "
            f"(answer: {scalability_answer})"
        )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scenarioId": "scalability-equity",
        "title": "Scalable Inference and Who Can Afford It",
        "subtitle": "The ancestry-aware analyses are the expensive ones",
        "estimatedMinutes": 10,
        "learningObjectives": [
            "Relate model family to genome-wide compute cost.",
            "Recognize that ancestry-aware models carry a multiplicative compute penalty.",
            "Explain why access to accelerated compute is an equity issue in study design.",
        ],
        "ancestryGroups": [],
        "prediction": {
            "pollId": "predict-scalability-equity",
            # Names all three analyses and their work multipliers, so "all three" refers to
            # something the participant has actually been told about.
            "question": (
                f"Three genome-wide scans are queued on a {platforms[default_platform]['label']} "
                f"for {default_variants} million variants in {sample_count:,} people: a standard "
                "GWAS scan, a local ancestry-aware scan "
                f"({families['Local ancestry-aware scan']}x the work), and a permutation scan "
                "(ancestry interaction with 1,000 permutations, "
                f"{families['Permutation scan (interaction, 1,000 permutations)']:,}x). Which finish "
                "within one week?"
            ),
            "options": [
                {"id": "all-three", "label": "All three scans"},
                {"id": "standard-and-local", "label": "The standard GWAS scan and the local ancestry-aware scan, but not the permutation scan"},
                {"id": "standard-only", "label": "The standard GWAS scan only"},
                {"id": "none", "label": "None of them"},
            ],
            "correctOptionId": scalability_answer,
        },
        "controls": [
            {
                "id": "modelId",
                "label": "Compute platform",
                "type": "select",
                "default": default_platform,
                "values": [
                    {"value": pid, "label": spec["label"]} for pid, spec in platforms.items()
                ],
            },
            {
                "id": "variantCount",
                "label": "Variants tested (millions)",
                "type": "slider",
                "default": default_variants,
                "min": min(variant_values),
                "max": max(variant_values),
                "step": 2,
            },
        ],
        "alleleFrequencies": [],
        "simulatedEffects": [],
        "associationResults": [],
        "powerEstimates": [],
        "interpretation": {
            "prompt": (
                "If a local ancestry-aware genome-wide scan takes four times the compute of "
                "a standard GWAS, who decides whether it gets run?"
            ),
            "whatChanged": (
                "Switching platforms does not change any scientific conclusion. It changes "
                "which analyses are practical at all, and the ones it gates are precisely "
                "the ancestry-aware models from the earlier modules."
            ),
            "whyItMatters": (
                "When the equity-improving analysis is also the expensive one, compute "
                "access silently determines whose biology gets discovered."
            ),
            "facilitatorNote": (
                "Connect this back to module 3: the local ancestry interaction model that "
                "detected the MTHFR locus — the Tractor-style scan from the framing slides — is "
                "the one sitting in the infeasible column on a Bridges-2 node. Switch the "
                "platform to the laptop, which is what most of the room has, and slide the "
                "variant count up: the local ancestry-aware scan drops out of the week too. "
                "Then switch to the GPU node and read the allocation panel: it is faster *and* "
                "cheaper in service units, because a GPU-hour is 2 SU and a node-hour of 128 "
                "cores is 128. Bridges-2 is free to US researchers with an ACCESS allocation; "
                "the cloud panel is what the same run costs on a credit card. 'Who can afford "
                "it' is therefore mostly 'who has an allocation and the expertise to use it', "
                "which is the argument for accelerated frameworks and for training, made concrete."
            ),
        },
        "infoPanels": [
            {
                "title": "Where the prices come from",
                "paragraphs": [
                    "Bridges-2 (Pittsburgh Supercomputing Center) is available at no cost for "
                    "research and education through NSF ACCESS allocations, and at cost-recovery "
                    "rates for other purposes; PSC publishes no hourly dollar rate. Its cost is "
                    "charged in service units: 1 core-hour = 1 SU on a Regular Memory node (128 "
                    "cores, two AMD EPYC 7742), and 2 SU per GPU-hour on an H100 node (8 GPUs, so "
                    f"16 SU per node-hour). An ACCESS Explore allocation is {ACCESS_EXPLORE_CREDITS:,} "
                    "credits; ACCESS sets a credit at about one core-hour, and the exact "
                    "credits-to-SU exchange for each system is read from the ACCESS credit "
                    "calculator.",
                    f"AWS and Google Cloud figures are on-demand list prices quoted on {PRICE_QUOTE_DATE} "
                    "for the closest instance to each hardware class: AWS c7a.32xlarge (128 cores) "
                    f"${platforms['cpu_single']['prices']['aws'][1]:.2f}/h, p5.48xlarge (8x H100) "
                    f"${platforms['gpu']['prices']['aws'][1]:.2f}/h and c7a.2xlarge (8 cores) "
                    f"${platforms['laptop']['prices']['aws'][1]:.2f}/h in us-east-1; Google Cloud "
                    f"c3d-standard-360 pro-rated to 128 physical cores ${platforms['cpu_single']['prices']['gcp'][1]:.2f}/h, "
                    f"a3-highgpu-8g (8x H100) ${platforms['gpu']['prices']['gcp'][1]:.2f}/h and "
                    f"c3d-standard-8 ${platforms['laptop']['prices']['gcp'][1]:.2f}/h in us-central1. "
                    "The 20-node class is twenty times the node. The laptop's figure is "
                    f"electricity (about 70 W at $0.17/kWh, ${platforms['laptop']['prices']['electricity'][1]:.3f}/h).",
                    "These are estimates of shape, not invoices: no reserved, spot or "
                    "committed-use discounts; no storage, data transfer, software or staff time; "
                    "and the throughput figures are order-of-magnitude illustrations rather than "
                    "benchmarks of a specific package. Any real run will cost a different number; "
                    "the ratios between scans and between platforms are what the module is about.",
                ],
            }
        ],
        "vizSummaries": {
            "runtimeCurve": by_control("variantCount", runtime_grid),
            "costCurve": by_control("variantCount", cost_grid),
            "allocationCurve": by_control("variantCount", allocation_grid),
            "allocationReference": [
                {
                    "label": "ACCESS Explore allocation",
                    "credits": ACCESS_EXPLORE_CREDITS,
                    "note": "400,000 ACCESS credits; a credit is set at about one core-hour",
                }
            ],
            "feasibility": by_control("variantCount", feasibility_grid),
            "discussionPrompts": [
                "Which analyses in your own pipeline would move from infeasible to routine?",
                "How should a grant budget reflect the cost of ancestry-aware analysis?",
            ],
        },
        "provenance": provenance(
            variant_keys=[],
            alpha=ALPHA_GENOME_WIDE,
            synthetic=[
                "Throughput figures (variant-sample operations per second) are order-of-magnitude "
                "illustrations of laptop versus Bridges-2 CPU versus Bridges-2 GPU association "
                "testing, not benchmarks of a specific software package.",
                f"Cloud prices are AWS and Google Cloud on-demand list prices quoted on {PRICE_QUOTE_DATE} "
                "for the closest instance to each Bridges-2 node class (see the module's "
                "'Where the prices come from' panel); the laptop's hourly cost is electricity.",
                "Work multipliers per scan (1x, 4x, 4,000x) are illustrative; the 4,000x "
                "permutation scan is the ancestry-interaction model under 1,000 permutations.",
            ],
            assumptions=[
                "Runtime scales as variants x 250,000 samples x model-family multiplier.",
                "Bridges-2 service units: 1 SU per core-hour on Regular Memory nodes (128 cores), "
                "2 SU per GPU-hour on H100 nodes (8 GPUs); Bridges-2 is allocated through NSF "
                "ACCESS at no cost for research and education and publishes no dollar rate. The "
                f"ACCESS Explore allocation ({ACCESS_EXPLORE_CREDITS:,} credits) is drawn at one "
                "credit per SU, ACCESS's stated approximation of a credit as one core-hour.",
                f"A one-week ({week_hours} hour) turnaround is the bar for an analysis to count as "
                "practical for iterative work.",
                f"Genome-wide significance is taken as alpha = {ALPHA_GENOME_WIDE}.",
            ],
        ),
    }


# --------------------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------------------

BUILDERS = [
    scenario_pooled_vs_stratified,
    scenario_within_vs_meta,
    scenario_global_vs_local,
    scenario_complexity_power,
    scenario_regularization,
    scenario_scalability,
]


def main() -> None:
    np.random.seed(SEED)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    index_entries = []
    for build in BUILDERS:
        bundle = build()
        filename = f"{bundle['scenarioId']}.json"
        path = OUT_DIR / filename
        # Indented while a human could plausibly read the diff. A bundle carrying a
        # multi-control grid runs to millions of characters either way, and there the
        # indentation is pure cost — on disk, in git, and in every participant's download.
        payload = json.dumps(bundle, indent=2) + "\n"
        if len(payload.encode("utf-8")) > PRETTY_MAX_BYTES:
            payload = json.dumps(bundle, separators=(",", ":")) + "\n"
        path.write_text(payload, encoding="utf-8")
        index_entries.append(
            {
                "id": bundle["scenarioId"],
                "file": filename,
                "title": bundle["title"],
                "subtitle": bundle["subtitle"],
                "estimatedMinutes": bundle["estimatedMinutes"],
            }
        )
        print(f"wrote {path.relative_to(ROOT)}")

    index = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedBy": "analysis/generate_scenarios.py",
        "generatorVersion": GENERATOR_VERSION,
        "seed": SEED,
        "scenarios": index_entries,
    }
    index_path = OUT_DIR / "index.json"
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {index_path.relative_to(ROOT)}")

    total = sum(entry["estimatedMinutes"] for entry in index_entries)
    print(f"\n{len(index_entries)} scenarios, {total} module minutes")


if __name__ == "__main__":
    main()
