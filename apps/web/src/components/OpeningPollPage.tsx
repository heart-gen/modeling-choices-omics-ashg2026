import { useEffect, useState, type FormEvent } from "react";
import { ExternalPollPrompt } from "./ExternalPollPanel";
import { PollResultsPanel } from "./PollResultsPanel";
import { externalPoll, fetchPoll, pollMode, submitResponse, type Poll } from "../pollingClient";
import { href } from "../router";

type Props = {
  answeredOptionId?: string;
  onAnswer: (optionId: string) => void;
};

/**
 * The opening poll as its own page, so the join slide can point at one URL and the question
 * is the only thing on the screen while the room answers it.
 *
 * It is deliberately not a module: there is no derived answer and nothing to reveal. After
 * answering, the room's counts appear through the same panel the facilitator projects.
 *
 * Static-first, per rule 2 in CONTRIBUTING.md: with no backend the page says so and sends
 * the participant on to the modules, which work regardless.
 */
export function OpeningPollPage({ answeredOptionId, onAnswer }: Props) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [selected, setSelected] = useState(answeredOptionId ?? "");
  const [unavailable, setUnavailable] = useState(pollMode !== "backend");
  const answered = Boolean(answeredOptionId);

  useEffect(() => {
    if (pollMode !== "backend") return;
    let cancelled = false;
    fetchPoll()
      .then((next) => {
        if (!cancelled) setPoll(next);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      setPoll(await submitResponse(selected));
      // Recorded only once the count is in, unlike a module prediction: an opening poll
      // with nothing to reveal has no reason to remember an answer the room never saw.
      onAnswer(selected);
    } catch {
      setUnavailable(true);
    }
  };

  const chosen = poll?.options.find((option) => option.id === answeredOptionId);

  return (
    <div className="opening-poll">
      <div className="section-heading">
        <p className="eyebrow">Before the first module</p>
        <h1>Opening poll</h1>
        <p>One answer per device. Aggregate counts only: no names, accounts, or identifying information.</p>
      </div>

      {unavailable ? (
        externalPoll ? (
          <ExternalPollPrompt poll={externalPoll} />
        ) : (
          <section className="poll-panel" aria-labelledby="opening-poll-status">
            <h2 id="opening-poll-status">Polling is unavailable</h2>
            <p>The facilitator will take this one as a show of hands. Every scenario module works regardless.</p>
          </section>
        )
      ) : !poll ? (
        <p role="status">Connecting to the live poll…</p>
      ) : answered ? (
        <section className="poll-panel" aria-live="polite">
          <p>
            You answered <strong>{chosen?.label ?? answeredOptionId}</strong>.
          </p>
          <PollResultsPanel heading="The room so far" />
        </section>
      ) : (
        <form onSubmit={submit} className="poll-panel">
          <fieldset>
            <legend>
              <h2 id="opening-poll-question">{poll.question}</h2>
            </legend>
            {poll.options.map((option) => (
              <label key={option.id} className="poll-option">
                <input
                  type="radio"
                  name="opening-poll"
                  value={option.id}
                  checked={selected === option.id}
                  onChange={() => setSelected(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <button className="button primary" type="submit" disabled={!selected}>
            Submit answer
          </button>
        </form>
      )}

      <div className="action-row">
        <a className="button secondary" href={href("scenarios")}>
          Start the modules
        </a>
      </div>
    </div>
  );
}
