"""Statistical primitives for the workshop scenario generator.

Everything the platform displays is derived from these functions rather than asserted,
so that a participant or reviewer can check any number in a scenario bundle against the
stated assumptions.

Model assumptions, applied throughout:

- Additive genotype dosage coded 0/1/2, in Hardy-Weinberg equilibrium, so a variant with
  allele frequency ``af`` has genotype variance ``2 * af * (1 - af)``.
- A continuous phenotype standardised to unit variance, so an effect size ``beta`` is in
  phenotype SD per allele and the residual SD is approximately 1 for the small effects
  used here.
- Wald tests on the additive coefficient, two-sided.

These are the standard simplifications behind analytical GWAS power calculations. They
are stated in each bundle's ``provenance.assumptions`` so the simplification travels with
the data.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import stats

__all__ = [
    "GroupEstimate",
    "MetaResult",
    "genotype_variance",
    "standard_error",
    "wald_p",
    "joint_wald_p",
    "power",
    "joint_power",
    "effective_sample_size",
    "fixed_effect_meta",
    "random_effects_meta",
]


def genotype_variance(af: float) -> float:
    """Variance of an additive 0/1/2 dosage under Hardy-Weinberg equilibrium."""
    return 2.0 * af * (1.0 - af)


def standard_error(
    n: int,
    af: float,
    residual_sd: float = 1.0,
    n_covariates: int = 0,
    ancestry_r2: float = 0.0,
    absorbed_r2: float = 0.0,
) -> float:
    """Analytical standard error of an additive effect estimate under covariate adjustment.

    Adjustment costs precision because covariates absorb genotype variance, and only the
    *residual* genotype variance identifies the effect. Two sources are modelled:

    - ``ancestry_r2`` — the share of genotype variance genuinely explained by ancestry.
      Large for a strongly differentiated variant, near zero when allele frequencies are
      similar across groups. This is the part of adjustment that buys real confounding
      control.
    - ``n_covariates / n`` — the share that ``k`` covariates absorb *by chance*. The
      expected R-squared of regressing any variable on ``k`` unrelated covariates is
      ``k / n``, so this term is pure cost and it scales inversely with sample size.

    That second term is why over-adjustment falls hardest on small groups: at n = 250,
    sixty covariates absorb roughly a quarter of the genotype variance, while at
    n = 100,000 they absorb effectively none. The equity consequence follows from the
    arithmetic rather than being asserted.

    ``absorbed_r2`` is an already-computed share to add on top, for a slope estimated in
    one stratum of ``n`` people while the covariates were fit on the whole cohort: their
    chance share is k over the cohort size, not over the stratum.

    ``residual_sd`` is how covariates *help*: a covariate that explains outcome variance
    shrinks the residual, and that gain can outweigh its k/n cost.
    """
    if not 0.0 < af < 1.0:
        raise ValueError(f"allele frequency must be in (0, 1); got {af}")
    if n_covariates >= n:
        raise ValueError(f"n={n} cannot support {n_covariates} covariates")

    absorbed = min(ancestry_r2 + absorbed_r2 + n_covariates / n, 0.95)
    residual_genotype_variance = genotype_variance(af) * (1.0 - absorbed)
    return residual_sd / math.sqrt(n * residual_genotype_variance)


def wald_p(beta: float, se: float) -> float:
    """Two-sided Wald p-value."""
    return float(2.0 * stats.norm.sf(abs(beta / se)))


def joint_wald_p(estimates: list[tuple[float, float]]) -> float:
    """P-value of the joint Wald test that *no* estimate differs from zero.

    Sum of squared z-scores against a chi-squared with one degree of freedom per estimate.
    This is the honest comparator when asking which analysis detects a locus: a model that
    fits one slope per ancestry background tests a different null hypothesis than a single
    pooled slope, and it pays for the extra parameters in degrees of freedom. Testing
    instead whether two slopes *differ* answers a different question — effect modification
    — and would flatter the interaction model wherever the effects agree.
    """
    if not estimates:
        raise ValueError("joint test needs at least one estimate")
    chi_squared = sum((beta / se) ** 2 for beta, se in estimates)
    return float(stats.chi2.sf(chi_squared, len(estimates)))


def power(beta: float, se: float, alpha: float) -> float:
    """Power of a two-sided Wald test at significance level ``alpha``."""
    z_crit = stats.norm.isf(alpha / 2.0)
    ncp = abs(beta) / se
    return float(stats.norm.sf(z_crit - ncp) + stats.norm.cdf(-z_crit - ncp))


def joint_power(estimates: list[tuple[float, float]], alpha: float) -> float:
    """Power of the joint Wald test in ``joint_wald_p`` at significance level ``alpha``.

    Under the alternative the test statistic is non-central chi-squared with one degree of
    freedom per estimate and non-centrality ``sum((beta / se)^2)``. The same non-centrality
    spread over more degrees of freedom is less power: this is the arithmetic behind "the
    interaction model pays for its extra parameters", and the reason a per-background model
    can lose to a single pooled slope when the backgrounds agree.
    """
    if not estimates:
        raise ValueError("joint test needs at least one estimate")
    df = len(estimates)
    ncp = sum((beta / se) ** 2 for beta, se in estimates)
    critical = stats.chi2.isf(alpha, df)
    return float(stats.ncx2.sf(critical, df, ncp))


def effective_sample_size(n: int, af: float) -> float:
    """Information content of a sample, which scales with ``n * 2 * af * (1 - af)``.

    Used to show why a group with a large ``n`` but a rare variant can contribute less
    information than a smaller group where the variant is common.
    """
    return n * genotype_variance(af)


@dataclass(frozen=True)
class GroupEstimate:
    """A within-group effect estimate."""

    group_id: str
    label: str
    n: int
    af: float
    beta: float
    se: float

    @property
    def p(self) -> float:
        return wald_p(self.beta, self.se)

    @property
    def weight(self) -> float:
        """Inverse-variance weight."""
        return 1.0 / (self.se**2)

    def ci(self, level: float = 0.95) -> tuple[float, float]:
        z = stats.norm.isf((1.0 - level) / 2.0)
        return (self.beta - z * self.se, self.beta + z * self.se)


@dataclass(frozen=True)
class MetaResult:
    """Summary of an evidence-synthesis model across groups."""

    beta: float
    se: float
    p: float
    q: float
    q_p: float
    i_squared: float
    tau_squared: float
    model: str

    def ci(self, level: float = 0.95) -> tuple[float, float]:
        z = stats.norm.isf((1.0 - level) / 2.0)
        return (self.beta - z * self.se, self.beta + z * self.se)


def _cochran_q(estimates: list[GroupEstimate], beta_common: float) -> float:
    return float(sum(e.weight * (e.beta - beta_common) ** 2 for e in estimates))


def fixed_effect_meta(estimates: list[GroupEstimate]) -> MetaResult:
    """Inverse-variance-weighted fixed-effect meta-analysis.

    Also returns Cochran's Q, its p-value, and I-squared, because the heterogeneity
    statistics are the point of the within-vs-meta scenario and should never be
    computed separately from the summary effect they qualify.
    """
    if len(estimates) < 2:
        raise ValueError("meta-analysis needs at least two groups")

    total_weight = sum(e.weight for e in estimates)
    beta = sum(e.weight * e.beta for e in estimates) / total_weight
    se = math.sqrt(1.0 / total_weight)

    df = len(estimates) - 1
    q = _cochran_q(estimates, beta)
    q_p = float(stats.chi2.sf(q, df))
    i_squared = max(0.0, (q - df) / q) if q > 0 else 0.0

    return MetaResult(
        beta=beta,
        se=se,
        p=wald_p(beta, se),
        q=q,
        q_p=q_p,
        i_squared=i_squared,
        tau_squared=0.0,
        model="fixed",
    )


def random_effects_meta(estimates: list[GroupEstimate]) -> MetaResult:
    """DerSimonian-Laird random-effects meta-analysis.

    The between-group variance ``tau^2`` widens the summary interval when the
    ancestry-specific estimates disagree, which is the behaviour the scenario is built
    to make visible.
    """
    if len(estimates) < 2:
        raise ValueError("meta-analysis needs at least two groups")

    fixed = fixed_effect_meta(estimates)
    df = len(estimates) - 1

    weights = np.array([e.weight for e in estimates])
    denominator = weights.sum() - (weights**2).sum() / weights.sum()
    tau_squared = max(0.0, (fixed.q - df) / denominator) if denominator > 0 else 0.0

    adjusted = np.array([1.0 / (e.se**2 + tau_squared) for e in estimates])
    betas = np.array([e.beta for e in estimates])
    beta = float((adjusted * betas).sum() / adjusted.sum())
    se = float(math.sqrt(1.0 / adjusted.sum()))

    return MetaResult(
        beta=beta,
        se=se,
        p=wald_p(beta, se),
        q=fixed.q,
        q_p=fixed.q_p,
        i_squared=fixed.i_squared,
        tau_squared=tau_squared,
        model="random",
    )
