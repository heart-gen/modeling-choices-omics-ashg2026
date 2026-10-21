export type ControlType = "slider" | "toggle" | "select";

export type ControlOption = {
  value: string;
  label: string;
};

export type ScenarioControl = {
  id: string;
  label: string;
  type: ControlType;
  default: string | number | boolean;
  values?: ControlOption[];
  min?: number;
  max?: number;
  step?: number;
};

export type AncestryGroup = {
  id: string;
  label: string;
  color: string;
  n: number;
};

export type ScenarioIndexEntry = {
  id: string;
  file: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
};

export type ScenarioIndex = {
  schemaVersion: string;
  scenarios: ScenarioIndexEntry[];
};

export type Variant = {
  rsid: string;
  gene: string;
  locus: string;
  trait: string;
};

export type ReferenceAlleleFrequency = {
  rsid: string;
  gene: string;
  locus: string;
  trait: string;
  source: string;
  note: string;
};

/**
 * Emitted by analysis/generate_scenarios.py for every bundle. The workshop abstract
 * claims the simulations are calibrated to real ancestry distributions and allele
 * frequencies; this block is the evidence for that claim, so the UI renders it rather
 * than asking the room to take it on faith.
 */
export type Provenance = {
  generator: string;
  generatorVersion: string;
  seed: number;
  alpha: number;
  realInputs: {
    alleleFrequencies?: ReferenceAlleleFrequency[];
    ancestryDistribution?: string;
  };
  syntheticInputs: string[];
  assumptions: string[];
  derived: string;
};

/** Keyed by one control: `values[String(value)]`. */
export type VizSeriesGrid = {
  byControl: string;
  values: Record<string, unknown[]>;
};

/**
 * Keyed by several controls at once, for modules whose parameters interact. The key is
 * each control's value, in `byControls` order, joined by "|" — see `gridKeyPart`.
 */
export type VizSeriesMultiGrid = {
  byControls: string[];
  values: Record<string, unknown[]>;
};

export type PredictionOption = { id: string; label: string };

/**
 * A multiple-choice prediction the participant commits to before the module's controls
 * unlock. `pollId` names the aggregate poll in backend/polling/poll.mjs, and the correct
 * option is computed by the generator from the precomputed results, never hand-entered.
 */
export type ScenarioPrediction = {
  pollId: string;
  question: string;
  options: PredictionOption[];
  correctOptionId: string;
};

/** A named starting point that sets several controls at once. */
export type ControlPreset = {
  id: string;
  label: string;
  description: string;
  state: ControlState;
};

export type ScenarioBundle = {
  schemaVersion: string;
  scenarioId: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  learningObjectives: string[];
  variant?: Variant;
  provenance: Provenance;
  ancestryGroups?: AncestryGroup[];
  controls: ScenarioControl[];
  presets?: ControlPreset[];
  prediction?: ScenarioPrediction;
  alleleFrequencies?: Array<{ variantId: string; groupId: string; af: number }>;
  simulatedEffects: Array<{ variantId: string; groupId?: string; beta: number; se?: number; mechanism: string }>;
  associationResults: Array<{ modelId: string; variantId: string; groupId?: string; beta: number; se: number; p: number; q?: number }>;
  powerEstimates: Array<{ modelId: string; groupId?: string; n: number; effectSize: number; power: number }>;
  localAncestryResults?: Array<{ locusId: string; position: number; ancestryState: string; beta: number; p: number }>;
  modelPerformance?: Array<{ modelId: string; groupId?: string; metric: string; value: number }>;
  /** Prose cards rendered under the charts, e.g. where module 6's prices come from. */
  infoPanels?: Array<{ title: string; paragraphs: string[] }>;
  interpretation: {
    prompt: string;
    whatChanged: string;
    whyItMatters: string;
    facilitatorNote: string;
  };
  vizSummaries: Record<string, unknown[] | VizSeriesGrid | VizSeriesMultiGrid>;
};

export type ControlState = Record<string, string | number | boolean>;

export type ParticipantSummary = {
  visitedScenarioIds: string[];
  notes: Record<string, string>;
  /**
   * Control selections per scenario. Held here rather than in the scenario page so a
   * participant's choices survive navigating away and back mid-session, and so the
   * take-home export can report what they actually chose in every module.
   */
  selections?: Record<string, ControlState>;
  /**
   * The option each committed prediction chose, per scenario. Persisted so a reload
   * mid-module neither re-locks the controls nor invites a second vote.
   */
  predictions?: Record<string, string>;
  /** The opening poll's chosen option, so a reload does not invite a second vote. */
  openingPollOptionId?: string;
};
