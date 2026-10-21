import { gridKeyPart } from "../scenarioUtils";
import type { ControlPreset, ControlState, ScenarioBundle, ScenarioControl } from "../types";

type Props = {
  scenario: ScenarioBundle;
  state: ControlState;
  onChange: (state: ControlState) => void;
  /** Modules that open with a committed prediction keep their controls shut until it is in. */
  locked?: boolean;
};

export function ControlPanel({ scenario, state, onChange, locked = false }: Props) {
  const update = (id: string, value: string | number | boolean) => {
    onChange({ ...state, [id]: value });
  };

  const applyPreset = (preset: ControlPreset) => {
    onChange({ ...state, ...preset.state });
  };

  // A preset is "active" when every control it sets still matches, so moving one slider
  // afterwards drops the highlight rather than misreporting where the participant is.
  const activePreset = scenario.presets?.find((preset) =>
    Object.entries(preset.state).every(([id, value]) => gridKeyPart(state[id]) === gridKeyPart(value))
  );

  // The heading stays rendered when locked: it is what the rehearsal scripts and the
  // facilitator's "Open module" link wait for, and a module with no visible heading reads
  // as a loading failure rather than as a deliberate gate. The fixed inputs show either way:
  // they are the premise of the question, not its answer.
  if (locked) {
    return (
      <section className="control-panel is-locked" aria-label="Interactive controls">
        <div>
          <p className="eyebrow">Locked</p>
          <h2>Model controls</h2>
        </div>
        <p>Commit your prediction to unlock the controls.</p>
        <FixedInputs scenario={scenario} />
      </section>
    );
  }

  return (
    <section className="control-panel" aria-label="Interactive controls">
      <div>
        <p className="eyebrow">Try the decision</p>
        <h2>Model controls</h2>
      </div>
      {scenario.presets && scenario.presets.length > 0 && (
        <>
          <div className="preset-row" role="group" aria-label="Starting points">
            {scenario.presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === activePreset?.id ? "chip is-active" : "chip"}
                aria-pressed={preset.id === activePreset?.id}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="hint" aria-live="polite">
            {activePreset?.description ?? "Your own setting. Pick a starting point above, or keep exploring."}
          </p>
        </>
      )}
      <div className="control-grid">
        {scenario.controls.map((control) => (
          <ControlField key={control.id} control={control} value={state[control.id]} onChange={update} />
        ))}
      </div>
      <FixedInputs scenario={scenario} />
    </section>
  );
}

/**
 * What the participant cannot change, next to what they can. The allele frequencies were a
 * chart of their own, which pushed the panels the controls actually drive off the screen;
 * a fixed parameter belongs in the decision box as a table, where it reads as a premise.
 */
function FixedInputs({ scenario }: { scenario: ScenarioBundle }) {
  const frequencies = scenario.alleleFrequencies ?? [];
  const groups = scenario.ancestryGroups ?? [];
  if (frequencies.length === 0 || groups.length === 0) return null;
  const rows = groups
    .map((group) => ({ group, af: frequencies.find((entry) => entry.groupId === group.id)?.af }))
    .filter((row): row is { group: (typeof groups)[number]; af: number } => typeof row.af === "number");
  if (rows.length === 0) return null;
  const variant = scenario.variant;
  return (
    <div className="fixed-inputs">
      <p className="eyebrow">
        Fixed at this locus
        {variant && <span className="fixed-variant"> · {variant.rsid} · {variant.gene} · {variant.trait}</span>}
      </p>
      <ul className="fixed-strip" aria-label="Effect-allele frequency and sample size per ancestry group">
        {rows.map(({ group, af }) => (
          <li key={group.id}>
            <span className="swatch" style={{ background: group.color }} aria-hidden="true" />
            <span className="fixed-group">{group.label}</span>
            <span className="fixed-value">
              <abbr title="effect-allele frequency">AF</abbr> {af.toFixed(2)}
            </span>
            <span className="fixed-value">n {group.n.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ControlField({
  control,
  value,
  onChange
}: {
  control: ScenarioControl;
  value: string | number | boolean | undefined;
  onChange: (id: string, value: string | number | boolean) => void;
}) {
  if (control.type === "select") {
    return (
      <label className="field">
        <span>{control.label}</span>
        <select value={String(value ?? control.default)} onChange={(event) => onChange(control.id, event.target.value)}>
          {control.values?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (control.type === "toggle") {
    return (
      <label className="field toggle-field">
        <span>{control.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value ?? control.default)}
          onChange={(event) => onChange(control.id, event.target.checked)}
        />
      </label>
    );
  }

  return (
    <label className="field">
      <span>
        {control.label}: <strong>{String(value ?? control.default)}</strong>
      </span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={Number(value ?? control.default)}
        onChange={(event) => onChange(control.id, Number(event.target.value))}
      />
    </label>
  );
}
