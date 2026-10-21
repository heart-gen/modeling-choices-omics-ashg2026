/**
 * Every poll the service accepts. Aggregate counts only: no names, accounts, IP
 * addresses, free text, or genetic data ever enter this service.
 *
 * Shared by every store and both runtimes (local http server, Lambda), so the option ids
 * a deployed DynamoDB table holds always match the ones the app renders. A module
 * prediction poll must also match the `prediction` block the generator writes into that
 * module's bundle; scripts/validate-scenarios.mjs checks the two against each other.
 */
export const practicePoll = {
  id: "analytic-practice",
  question: "How does your team usually evaluate ancestry-related heterogeneity?",
  options: [
    { id: "pooled-only", label: "Pooled analysis only" },
    { id: "subgroup-check", label: "Pooled plus subgroup checks" },
    { id: "ancestry-aware", label: "Ancestry-aware models by default" },
    { id: "varies", label: "It varies by project" }
  ]
};

/**
 * One per module that opens with a committed prediction. Each must match that module's
 * `prediction` block exactly, which `npm run validate:data` enforces — a label that differs
 * projects one answer while counting another.
 */
export const predictionPolls = [
  {
    id: "predict-pooled-vs-stratified",
    question: "Raise the European-ancestry share of the pooled sample from 35% to 95%. What happens to the pooled effect estimate?",
    options: [
      { id: "toward-european", label: "It grows toward the strong European-ancestry effect" },
      { id: "toward-african", label: "It shrinks toward the weak African-ancestry effect" },
      { id: "unchanged", label: "It stays put; only the interval changes" },
      { id: "loses-significance", label: "It stops being significant" }
    ]
  },
  {
    id: "predict-within-vs-meta",
    question: "Four ancestry groups are meta-analysed. Push heterogeneity to 100%, where the East Asian effect is about 3 times the others'. What happens to the fixed-effect summary?",
    options: [
      { id: "stays-narrow", label: "It stays narrow and significant" },
      { id: "widens", label: "Its interval widens like the random-effects one" },
      { id: "non-significant", label: "It stops being significant" },
      { id: "flips", label: "It flips sign" }
    ]
  },
  {
    id: "predict-global-vs-local-ancestry",
    question: "The tag SNP has opposite effects on African- and European-ancestry haplotypes (+0.12 and -0.08) in a 15,000-person admixed study. Which is the simplest analysis that detects it at p < 0.05?",
    options: [
      { id: "global_pc", label: "Global ancestry PCs" },
      { id: "local_covariate", label: "Adding local ancestry as a covariate" },
      { id: "local_interaction", label: "Local ancestry interaction" },
      { id: "none", label: "None at this sample size" }
    ]
  },
  {
    id: "predict-complexity-power",
    question: "At this locus the effect is the same on every ancestry background and the allele frequencies are similar. In an admixed study of 500 people adjusted for age, sex and ten global PCs, which of global ancestry PCs alone, adding a local-ancestry covariate, and the local-ancestry interaction model detect it at p < 0.05?",
    options: [
      { id: "all-three", label: "All three" },
      { id: "global-and-covariate", label: "Global PCs and the local-ancestry covariate, but not the interaction model" },
      { id: "global-only", label: "Global ancestry PCs only" },
      { id: "none", label: "None of them" }
    ]
  },
  {
    id: "predict-regularization-heterogeneity",
    question: "Three polygenic scores are trained on a cohort that is 59% European, 23% African and 18% Admixed American ancestry. At the starting shrinkage, which score is best calibrated in the smallest ancestry group?",
    options: [
      { id: "shared_sparse", label: "The pooled-cohort PRS" },
      { id: "group_aware", label: "The ancestry-aware PRS" },
      { id: "strong_regularization", label: "The pooled PRS under strong shrinkage" },
      { id: "tied", label: "They are equally calibrated" }
    ]
  },
  {
    id: "predict-scalability-equity",
    question: "Three genome-wide scans are queued on a Bridges-2 RM node (128 cores) for 8 million variants in 250,000 people: a standard GWAS scan, a local ancestry-aware scan (4x the work), and a permutation scan (ancestry interaction with 1,000 permutations, 4,000x). Which finish within one week?",
    options: [
      { id: "all-three", label: "All three scans" },
      { id: "standard-and-local", label: "The standard GWAS scan and the local ancestry-aware scan, but not the permutation scan" },
      { id: "standard-only", label: "The standard GWAS scan only" },
      { id: "none", label: "None of them" }
    ]
  }
];

export const polls = new Map([practicePoll, ...predictionPolls].map((poll) => [poll.id, poll]));

export function getPoll(pollId) {
  return polls.get(pollId);
}

export function requirePoll(pollId) {
  const poll = polls.get(pollId);
  if (!poll) throw new Error("Unknown poll");
  return poll;
}

/** Shapes raw per-option counts into the response body both endpoints return. */
export function buildSnapshot(poll, counts) {
  const options = poll.options.map((option) => ({
    ...option,
    count: counts.get(option.id) ?? 0
  }));
  return {
    ...poll,
    responseCount: options.reduce((total, option) => total + option.count, 0),
    options
  };
}

export function isKnownOption(poll, optionId) {
  return poll.options.some((option) => option.id === optionId);
}
