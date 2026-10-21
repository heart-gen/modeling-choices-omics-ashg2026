import { useEffect, useMemo, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { FacilitatorLogin } from "./components/FacilitatorLogin";
import { FacilitatorView } from "./components/FacilitatorView";
import { OpeningPollPage } from "./components/OpeningPollPage";
import { PredictionVote } from "./components/PredictionVote";
import { ProvenancePanel } from "./components/ProvenancePanel";
import { ScenarioCharts } from "./components/ScenarioCharts";
import { SummaryExport } from "./components/SummaryExport";
import { loadScenario, loadScenarioIndex } from "./dataLoader";
import { facilitatorHref, href, parseLocation, type Route } from "./router";
import { defaultControlState, getDiscussionPrompts } from "./scenarioUtils";
import type { ControlState, ParticipantSummary, ScenarioBundle, ScenarioIndexEntry } from "./types";

const storageKey = "omics-modeling-choices-summary";

const emptySummary: ParticipantSummary = { visitedScenarioIds: [], notes: {}, selections: {} };

function readSummary(): ParticipantSummary {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return emptySummary;
    // Summaries saved before control selections were persisted have no `selections`.
    return { ...emptySummary, ...(JSON.parse(raw) as ParticipantSummary) };
  } catch {
    return emptySummary;
  }
}

function persistSummary(summary: ParticipantSummary) {
  window.localStorage.setItem(storageKey, JSON.stringify(summary));
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseLocation(window.location));
  const [entries, setEntries] = useState<ScenarioIndexEntry[]>([]);
  const [scenarios, setScenarios] = useState<Record<string, ScenarioBundle>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParticipantSummary>(() => readSummary());

  useEffect(() => {
    const updateRoute = () => setRoute(parseLocation(window.location));
    const onLinkClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[data-spa-link]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      event.preventDefault();
      window.history.pushState({}, "", target.href);
      updateRoute();
    };
    window.addEventListener("click", onLinkClick);
    window.addEventListener("popstate", updateRoute);
    window.addEventListener("hashchange", updateRoute);
    return () => {
      window.removeEventListener("click", onLinkClick);
      window.removeEventListener("popstate", updateRoute);
      window.removeEventListener("hashchange", updateRoute);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const index = await loadScenarioIndex();
        const loadedScenarios = await Promise.all(index.scenarios.map((entry) => loadScenario(entry.file)));
        if (cancelled) return;
        setEntries(index.scenarios);
        setScenarios(Object.fromEntries(loadedScenarios.map((scenario) => [scenario.scenarioId, scenario])));
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load workshop data.");
        setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSummary = (next: ParticipantSummary) => {
    setSummary(next);
    persistSummary(next);
  };

  const activeScenario = route.name === "scenario" ? scenarios[route.scenarioId] : undefined;

  return (
    <main>
      <SkipLink />
      <TopNav />
      <section id="content" className="page-shell" tabIndex={-1}>
        {loading && <StatusPanel title="Loading workshop data" body="Preparing the guided decision lab." />}
        {error && <StatusPanel title="Data loading error" body={error} />}
        {!loading && !error && route.name === "home" && <LandingPage scenarios={entries} />}
        {!loading && !error && route.name === "scenarios" && (
          <ScenarioSelection entries={entries} scenarios={scenarios} summary={summary} />
        )}
        {!loading && !error && route.name === "poll" && (
          <OpeningPollPage
            answeredOptionId={summary.openingPollOptionId}
            onAnswer={(optionId) => updateSummary({ ...summary, openingPollOptionId: optionId })}
          />
        )}
        {!loading && !error && route.name === "facilitator" && (
          <FacilitatorLogin>
            <FacilitatorView entries={entries} scenarios={scenarios} />
          </FacilitatorLogin>
        )}
        {!loading && !error && route.name === "scenario" && activeScenario && (
          <ScenarioPage
            // Keying on the scenario remounts the page when the participant moves between
            // modules, which is how React resets per-module state such as the prediction
            // capture. Control selections survive because they live in the summary, not
            // in this component.
            key={activeScenario.scenarioId}
            scenario={activeScenario}
            summary={summary}
            updateSummary={updateSummary}
          />
        )}
        {!loading && !error && route.name === "scenario" && !activeScenario && (
          <StatusPanel title="Scenario not found" body="Choose a scenario from the workshop menu." />
        )}
      </section>
    </main>
  );
}

function SkipLink() {
  return (
    <a className="skip-link" href="#content">
      Skip to content
    </a>
  );
}

function TopNav() {
  return (
    <header className="top-nav">
      <a className="brand" href={href("/")}>
        Modeling Choices in Omics
      </a>
      <nav aria-label="Primary navigation">
        <a href={href("poll")}>Opening poll</a>
        <a href={href("scenarios")}>Scenarios</a>
        <a data-spa-link href={facilitatorHref()}>Facilitator</a>
      </nav>
    </header>
  );
}

function StatusPanel({ title, body }: { title: string; body: string }) {
  return (
    <article className="status-panel">
      <h1>{title}</h1>
      <p>{body}</p>
    </article>
  );
}

function LandingPage({ scenarios }: { scenarios: ScenarioIndexEntry[] }) {
  return (
    <div className="landing-grid">
      <section className="intro-panel">
        <p className="eyebrow">ASHG 2026 workshop</p>
        <h1>Modeling Choices in Omics</h1>
        <p className="lede">
          Explore how routine analytic decisions in genomics and multi-omics studies influence biological inference,
          interpretability, and equity in diverse and admixed populations.
        </p>
        <div className="action-row">
          <a className="button primary" href={href("poll")}>
            Opening poll
          </a>
          <a className="button secondary" href={href("scenarios")}>
            Start workshop
          </a>
          <a className="button secondary" data-spa-link href={facilitatorHref()}>
            Facilitator view
          </a>
        </div>
      </section>
      <aside className="lab-panel" aria-label="Workshop design principles">
        <h2>Decision Lab</h2>
        <ul>
          <li>No coding, uploads, accounts, or installation.</li>
          <li>All statistics are synthetic and precomputed.</li>
          <li>Each scenario connects a modeling choice to an equity-relevant interpretation.</li>
        </ul>
        <div className="metric-strip" aria-label="Workshop facts">
          <span>
            <strong>{scenarios.length}</strong>
            scenarios
          </span>
          <span>
            <strong>2 hr</strong>
            guided flow
          </span>
          <span>
            <strong>{scenarios.length}</strong>
            predictions to commit
          </span>
        </div>
        <section className="poll-panel" aria-labelledby="opening-poll-teaser">
          <h2 id="opening-poll-teaser">Opening poll</h2>
          <p>
            Before the first module, tell the room how your team usually evaluates ancestry-related
            heterogeneity. It is not a module: nothing is scored, and the counts are projected live.
          </p>
          <a className="button secondary full-width" href={href("poll")}>
            Answer the opening poll
          </a>
        </section>
      </aside>
    </div>
  );
}

function ScenarioSelection({
  entries,
  scenarios,
  summary
}: {
  entries: ScenarioIndexEntry[];
  scenarios: Record<string, ScenarioBundle>;
  summary: ParticipantSummary;
}) {
  // Export every module the participant actually opened, in workshop order, so the
  // take-home file is a record of their session rather than a list of scenario ids.
  const visited = entries
    .map((entry) => scenarios[entry.id])
    .filter((scenario): scenario is ScenarioBundle =>
      Boolean(scenario) && summary.visitedScenarioIds.includes(scenario.scenarioId)
    );

  return (
    <div>
      <div className="section-heading">
        <p className="eyebrow">Workshop mode</p>
        <h1>Choose a scenario</h1>
        <p>
          Move through the cards in order during the live session, or open a specific analytic decision for review.
        </p>
      </div>
      <div className="scenario-grid">
        {entries.map((entry, index) => {
          const visited = summary.visitedScenarioIds.includes(entry.id);
          return (
            <a className="scenario-card" href={href(`scenario/${entry.id}`)} key={entry.id}>
              <span className="card-index">Module {index + 1}</span>
              <h2>{entry.title}</h2>
              <p>{entry.subtitle}</p>
              <span className="card-meta">{entry.estimatedMinutes} min</span>
              {visited && <span className="visited">Visited</span>}
            </a>
          );
        })}
      </div>
      <SummaryExport scenarios={visited} summary={summary} />
    </div>
  );
}

function ScenarioPage({
  scenario,
  summary,
  updateSummary
}: {
  scenario: ScenarioBundle;
  summary: ParticipantSummary;
  updateSummary: (summary: ParticipantSummary) => void;
}) {
  const [prediction, setPrediction] = useState("");
  const [predictionRevealed, setPredictionRevealed] = useState(false);
  const note = summary.notes[scenario.scenarioId] ?? "";
  const prompts = useMemo(() => getDiscussionPrompts(scenario), [scenario]);

  const committedPrediction = summary.predictions?.[scenario.scenarioId];
  // Modules that open with a multiple-choice prediction hold their results back until it is
  // committed: with the charts on screen, "predict first" is a reading exercise.
  const gated = Boolean(scenario.prediction) && !committedPrediction;

  // Derived from the persisted summary, not local state, so leaving a module and coming
  // back keeps the participant's choices. Memoised on the selections object rather than
  // the whole summary: typing in the note field replaces `summary` but not `selections`,
  // and an unstable control-state identity would dispose and re-init every chart on each
  // keystroke.
  const controlState = useMemo(
    () => summary.selections?.[scenario.scenarioId] ?? defaultControlState(scenario),
    [summary.selections, scenario]
  );

  const setControlState = (next: ControlState) => {
    updateSummary({
      ...summary,
      selections: { ...summary.selections, [scenario.scenarioId]: next }
    });
  };

  const commitPrediction = (optionId: string) => {
    updateSummary({
      ...summary,
      predictions: { ...summary.predictions, [scenario.scenarioId]: optionId }
    });
  };

  // Per-module state (the prediction capture above) resets by remount: App keys this
  // component on the scenario id, so no effect is needed to clear it.

  useEffect(() => {
    if (summary.visitedScenarioIds.includes(scenario.scenarioId)) return;
    updateSummary({
      ...summary,
      visitedScenarioIds: [...summary.visitedScenarioIds, scenario.scenarioId]
    });
  }, [scenario.scenarioId, summary, updateSummary]);

  const updateNote = (value: string) => {
    updateSummary({
      ...summary,
      notes: {
        ...summary.notes,
        [scenario.scenarioId]: value
      }
    });
  };

  return (
    <div className="scenario-layout">
      <section className="scenario-main">
        <a className="back-link" href={href("scenarios")}>
          Back to scenarios
        </a>
        <div className="section-heading compact">
          <p className="eyebrow">
            {scenario.estimatedMinutes} minute module
            {scenario.variant && (
              <span className="variant-chip">
                {scenario.variant.rsid} · {scenario.variant.gene}
              </span>
            )}
          </p>
          <h1>{scenario.title}</h1>
          <p>{scenario.subtitle}</p>
        </div>
        {/* The objectives live in the side column: they are reference text, and above the
            controls they pushed the panels the controls redraw below the fold. */}
        <ControlPanel scenario={scenario} state={controlState} onChange={setControlState} locked={gated} />
        {gated ? (
          <section className="chart-card locked-results">
            <div className="chart-heading">
              <h2>Results hidden</h2>
              <p>Commit your prediction to unlock the charts and the model controls.</p>
            </div>
          </section>
        ) : (
          <ScenarioCharts scenario={scenario} state={controlState} />
        )}
        {!gated &&
          scenario.infoPanels?.map((panel) => (
            <section className="chart-card info-card" key={panel.title} aria-label={panel.title}>
              <div className="chart-heading">
                <h2>{panel.title}</h2>
              </div>
              {panel.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ))}
        <ProvenancePanel scenario={scenario} />
      </section>
      <aside className="scenario-side">
        {scenario.prediction ? (
          <PredictionVote
            prediction={scenario.prediction}
            committedOptionId={committedPrediction}
            onCommit={commitPrediction}
            whatChanged={scenario.interpretation.whatChanged}
          />
        ) : (
          <section className="side-card">
            <h2>Prediction prompt</h2>
            <p>{scenario.interpretation.prompt}</p>
            <label className="field" htmlFor="scenario-prediction">
              <span>Your prediction</span>
              <textarea
                id="scenario-prediction"
                value={prediction}
                onChange={(event) => setPrediction(event.target.value)}
                rows={3}
                disabled={predictionRevealed}
                placeholder="Commit to a prediction before revealing the explanation."
              />
            </label>
            {!predictionRevealed && (
              <button
                className="button secondary full-width"
                type="button"
                disabled={!prediction.trim()}
                onClick={() => setPredictionRevealed(true)}
              >
                Reveal what changed
              </button>
            )}
            {predictionRevealed && (
              <div className="prediction-reveal" aria-live="polite">
                <h3>What changed?</h3>
                <p>{scenario.interpretation.whatChanged}</p>
              </div>
            )}
          </section>
        )}
        <DecisionBox title="Why this matters" body={scenario.interpretation.whyItMatters} emphasis />
        <section className="side-card">
          <h2>Learning objectives</h2>
          <ul className="objective-list">
            {scenario.learningObjectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </section>
        <section className="side-card">
          <h2>Small-group prompts</h2>
          <ul>
            {prompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </section>
        <section className="side-card">
          <h2>Take-home note</h2>
          <label className="sr-only" htmlFor="scenario-note">
            Note for this scenario
          </label>
          <textarea
            id="scenario-note"
            value={note}
            onChange={(event) => updateNote(event.target.value)}
            rows={5}
            placeholder="Write one decision rule or caution you want to remember."
          />
          <SummaryExport scenarios={[scenario]} summary={summary} />
        </section>
      </aside>
    </div>
  );
}

function DecisionBox({ title, body, emphasis = false }: { title: string; body: string; emphasis?: boolean }) {
  return (
    <section className={emphasis ? "side-card emphasis" : "side-card"}>
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}
