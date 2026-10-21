import { PollResultsPanel } from "./PollResultsPanel";
import { href, pollJoinUrl } from "../router";
import type { ScenarioBundle, ScenarioIndexEntry } from "../types";

type Props = {
  entries: ScenarioIndexEntry[];
  scenarios: Record<string, ScenarioBundle>;
};

export function FacilitatorView({ entries, scenarios }: Props) {
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.estimatedMinutes, 0);

  // Modules that collect a committed prediction, in workshop order. This is what the
  // synthesis segment reads from: the room's answers next to the derived one.
  const predictionModules = entries
    .map((entry, index) => ({ entry, index, scenario: scenarios[entry.id] }))
    .filter((item) => Boolean(item.scenario?.prediction));

  return (
    <div>
      <div className="section-heading">
        <p className="eyebrow">Instructor mode</p>
        <h1>Facilitator run sheet</h1>
        <p>
          Use this view for timing, narration cues, and backup prompts. Participant screens do not need synchronization.
        </p>
      </div>
      <section className="run-sheet-summary">
        <span>
          <strong>{entries.length}</strong>
          modules
        </span>
        <span>
          <strong>{totalMinutes}</strong>
          module minutes
        </span>
        <span>
          <strong>Static</strong>
          fallback ready
        </span>
      </section>
      <PollResultsPanel heading="Opening poll" />
      <p className="hint">
        Participants answer at <strong>{pollJoinUrl()}</strong>; the join slide carries the same link.
      </p>
      <section className="room-vs-reality">
        <div className="section-heading compact">
          <p className="eyebrow">Synthesis</p>
          <h2>Room vs reality</h2>
          <p>
            What the room predicted, against the answer each module's precomputed numbers give at its
            starting setting. Project this during synthesis; the gap is the discussion.
          </p>
        </div>
        {predictionModules.length === 0 ? (
          <p>No module collects a committed prediction yet.</p>
        ) : (
          predictionModules.map(({ entry, index, scenario }) => (
            <PollResultsPanel
              key={entry.id}
              pollId={scenario.prediction!.pollId}
              heading={`Module ${index + 1} prediction`}
              correctOptionId={scenario.prediction!.correctOptionId}
            />
          ))
        )}
      </section>
      <div className="facilitator-list">
        {entries.map((entry, index) => {
          const scenario = scenarios[entry.id];
          return (
            <article className="facilitator-card" key={entry.id}>
              <div>
                <p className="eyebrow">Module {index + 1} · {entry.estimatedMinutes} min</p>
                <h2>{entry.title}</h2>
                <p>{entry.subtitle}</p>
              </div>
              {scenario && (
                <>
                  {scenario.prediction ? (
                    <section>
                      <h3>Collect first</h3>
                      <p>{scenario.prediction.question}</p>
                      <p>
                        Participants cannot see the charts until they commit. Project the split before
                        you reveal.
                      </p>
                    </section>
                  ) : (
                    <section>
                      <h3>Ask first</h3>
                      <p>{scenario.interpretation.prompt}</p>
                    </section>
                  )}
                  <section>
                    <h3>Reveal</h3>
                    <p>{scenario.interpretation.whatChanged}</p>
                  </section>
                  <section>
                    <h3>Instructor note</h3>
                    <p>{scenario.interpretation.facilitatorNote}</p>
                  </section>
                </>
              )}
              <a className="button secondary" href={href(`scenario/${entry.id}`)}>
                Open module
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}
