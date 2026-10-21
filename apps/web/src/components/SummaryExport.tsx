import { buildPlainSummary, defaultControlState } from "../scenarioUtils";
import type { ParticipantSummary, ScenarioBundle } from "../types";

type Props = {
  scenarios: ScenarioBundle[];
  summary: ParticipantSummary;
};

export function SummaryExport({ scenarios, summary }: Props) {
  const exportSummary = () => {
    const header = [
      "Modeling Choices in Omics: Take-home Summary",
      "ASHG 2026 workshop",
      `Exported ${new Date().toISOString().slice(0, 10)}`
    ];
    const body =
      scenarios.length > 0
        ? scenarios.map((scenario) =>
            buildPlainSummary(
              scenario,
              // Selections live in the persisted summary, so the export always reports the
              // participant's own choices rather than the scenario defaults.
              summary.selections?.[scenario.scenarioId] ?? defaultControlState(scenario),
              summary.notes[scenario.scenarioId] ?? ""
            )
          )
        : ["No modules opened yet. Visit a scenario to build a take-home summary."];

    const blob = new Blob([[...header, ...body].join("\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "omics-modeling-choices-summary.txt";
    // Attach before clicking, and defer the revoke: revoking synchronously after click()
    // races the download in Firefox and Safari, which silently yields an empty file.
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <button className="button secondary full-width" type="button" onClick={exportSummary}>
      Export take-home summary
    </button>
  );
}
