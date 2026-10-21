"""Curated real-world reference values used to calibrate the workshop scenarios.

Scope of the calibration claim, stated precisely so it can be defended from the floor:

- **Allele frequencies are real.** Each scenario is anchored to a named, well-studied
  variant, using published continental-group frequencies.
- **Ancestry distributions are real.** Group sample sizes are scaled from the genetic
  ancestry composition of the All of Us Research Program.
- **Effect sizes are synthetic.** They are chosen to make a teaching contrast legible and
  are declared as assumptions, not estimates. No scenario claims a real effect size for a
  real variant.
- **Everything downstream is computed**, not asserted: standard errors, p-values, power,
  meta-analysis summaries, and heterogeneity statistics all come from `genetics.py`.

The frequencies below are curated from published continental-group summaries (gnomAD v4
and 1000 Genomes Phase 3) and rounded to two decimals. They are transcribed constants,
not a programmatic database pull; treat them as representative of the well-documented
frequency *pattern* for each variant rather than as an exact database extraction. If the
workshop later needs exact figures, replace this module with a gnomAD API fetch and
record the query date in the provenance block.
"""

from __future__ import annotations

from dataclasses import dataclass, field

__all__ = ["Variant", "VARIANTS", "ALL_OF_US_ANCESTRY", "GROUP_LABELS", "GROUP_COLORS", "cohort"]


@dataclass(frozen=True)
class Variant:
    """A real variant used to anchor a scenario's allele frequencies."""

    rsid: str
    gene: str
    locus: str
    trait: str
    note: str
    source: str
    frequencies: dict[str, float] = field(default_factory=dict)


VARIANTS: dict[str, Variant] = {
    # The canonical local-ancestry example. Duffy-null is near-fixed in African ancestry
    # and absent in European ancestry, and drives benign ethnic neutropenia, so in
    # admixed genomes the white-blood-cell association tracks *local* ancestry at
    # 1q23.2 rather than global ancestry proportion.
    "rs2814778": Variant(
        rsid="rs2814778",
        gene="ACKR1 (DARC)",
        locus="1q23.2",
        trait="white blood cell count",
        note=(
            "Duffy-null promoter variant. Near-fixed in African ancestry, effectively "
            "absent in European and East Asian ancestry. The textbook case where local "
            "ancestry at the locus, not global ancestry, carries the biology."
        ),
        source="gnomAD v4; 1000 Genomes Phase 3",
        frequencies={"afr": 0.96, "eur": 0.00, "eas": 0.00, "amr": 0.28},
    ),
    # Similar frequencies across groups: the case where ancestry adjustment buys little
    # confounding control and costs degrees of freedom.
    "rs7412": Variant(
        rsid="rs7412",
        gene="APOE",
        locus="19q13.32",
        trait="LDL cholesterol",
        note=(
            "APOE epsilon-2 defining variant. Frequencies are broadly similar across "
            "continental groups, so ancestry adjustment removes little confounding here "
            "while still consuming degrees of freedom."
        ),
        source="gnomAD v4; 1000 Genomes Phase 3",
        frequencies={"afr": 0.11, "eur": 0.08, "eas": 0.09, "amr": 0.06},
    ),
    # Strong differentiation with a real functional effect: good heterogeneity story.
    "rs1229984": Variant(
        rsid="rs1229984",
        gene="ADH1B",
        locus="4q23",
        trait="alcohol consumption",
        note=(
            "ADH1B Arg48His. Common in East Asian ancestry and rare elsewhere, so a "
            "multi-ancestry meta-analysis averages over groups that carry very different "
            "amounts of information about the variant."
        ),
        source="gnomAD v4; 1000 Genomes Phase 3",
        frequencies={"afr": 0.02, "eur": 0.03, "eas": 0.70, "amr": 0.10},
    ),
    # Strongly differentiated but common in several groups: pooled vs stratified contrast.
    "rs4988235": Variant(
        rsid="rs4988235",
        gene="MCM6 / LCT",
        locus="2q21.3",
        trait="lactase persistence",
        note=(
            "Lactase persistence regulatory variant. Common in European ancestry and much "
            "rarer elsewhere, so a pooled analysis draws most of its information from one "
            "group while still reporting a single average effect."
        ),
        source="gnomAD v4; 1000 Genomes Phase 3",
        frequencies={"afr": 0.13, "eur": 0.74, "eas": 0.02, "amr": 0.42},
    ),
    # Common in every group, so a pooled scan is well powered. Used where the teaching
    # point is an ancestry-*modified* effect rather than an ancestry-specific frequency.
    "rs1801133": Variant(
        rsid="rs1801133",
        gene="MTHFR",
        locus="1p36.22",
        trait="homocysteine",
        note=(
            "MTHFR C677T. Common in every continental group but at materially different "
            "frequencies, so a pooled analysis is well powered while still averaging "
            "over groups."
        ),
        source="gnomAD v4; 1000 Genomes Phase 3",
        frequencies={"afr": 0.11, "eur": 0.34, "eas": 0.42, "amr": 0.47},
    ),
}


# Genetic ancestry composition of the All of Us Research Program short-read WGS cohort
# (v7, approximately 245,000 participants). Used to set the *relative* sizes of the
# ancestry groups in each scenario, so the representation imbalance participants see is
# the one in a real, actively used multi-ancestry resource.
ALL_OF_US_ANCESTRY: dict[str, float] = {
    "eur": 0.54,
    "afr": 0.21,
    "amr": 0.17,
    "eas": 0.03,
    "sas": 0.02,
    "mid": 0.01,
}

ALL_OF_US_SOURCE = (
    "All of Us Research Program, genomic data release v7 "
    "(~245,000 short-read whole genomes); ancestry proportions rounded to whole percent."
)

GROUP_LABELS: dict[str, str] = {
    "afr": "African ancestry",
    "eur": "European ancestry",
    "eas": "East Asian ancestry",
    # gnomAD v4's term. "Latino" is an ethnicity label, and the framing slides spend two
    # slides separating race and ethnicity from genetic ancestry; every group here is
    # named as an ancestry for the same reason.
    "amr": "Admixed American ancestry",
    "sas": "South Asian ancestry",
    "mid": "Middle Eastern ancestry",
}

# Colour-blind-safe qualitative assignments, fixed per group so a group keeps one colour
# across every chart in the platform.
GROUP_COLORS: dict[str, str] = {
    "afr": "#2563eb",
    "eur": "#059669",
    "amr": "#b45309",
    "eas": "#7c3aed",
    "sas": "#db2777",
    "mid": "#475569",
}


def cohort(total_n: int, groups: list[str]) -> dict[str, int]:
    """Split a cohort of ``total_n`` across ``groups`` using All of Us proportions.

    Proportions are renormalised over the requested subset, so a scenario that uses
    three groups still reflects their real relative representation.
    """
    missing = [g for g in groups if g not in ALL_OF_US_ANCESTRY]
    if missing:
        raise KeyError(f"unknown ancestry groups: {missing}")

    weights = {g: ALL_OF_US_ANCESTRY[g] for g in groups}
    total_weight = sum(weights.values())
    # Round to the nearest 10 so the numbers read as a study design rather than noise.
    return {g: int(round(total_n * w / total_weight / 10.0)) * 10 for g, w in weights.items()}
