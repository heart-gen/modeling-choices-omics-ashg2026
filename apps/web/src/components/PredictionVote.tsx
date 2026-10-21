import { useEffect, useState, type FormEvent } from "react";
import { fetchPoll, pollMode, submitResponse, type Poll } from "../pollingClient";
import type { ScenarioPrediction } from "../types";

type Props = {
  prediction: ScenarioPrediction;
  committedOptionId?: string;
  onCommit: (optionId: string) => void;
  whatChanged: string;
};

/**
 * The commit-then-reveal gate that opens a module.
 *
 * Two things make this worth the code over the free-text box it replaces. The participant
 * cannot see the result until they have taken a position, so the prediction is a commitment
 * rather than a reading exercise. And the room's split becomes visible to everyone
 * afterwards, which is what the synthesis segment narrates.
 *
 * Static-first, per rule 2 in CONTRIBUTING.md: with no polling backend the commit still
 * records locally and still reveals; only the room's counts are missing.
 */
export function PredictionVote({ prediction, committedOptionId, onCommit, whatChanged }: Props) {
  const [selected, setSelected] = useState(committedOptionId ?? "");
  const [poll, setPoll] = useState<Poll | null>(null);
  const [roomUnavailable, setRoomUnavailable] = useState(pollMode !== "backend");
  const committed = Boolean(committedOptionId);

  // Deliberately only after committing: seeing the room's distribution first is a hint, and
  // anchoring on it is exactly what a committed prediction exists to prevent.
  useEffect(() => {
    if (!committed || pollMode !== "backend") return;
    let cancelled = false;
    fetchPoll(prediction.pollId)
      .then((next) => {
        if (!cancelled) setPoll(next);
      })
      .catch(() => {
        if (!cancelled) setRoomUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [committed, prediction.pollId]);

  const commit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    // Local first: the reveal must not wait on the network, and must still happen without it.
    onCommit(selected);
    if (pollMode !== "backend") return;
    try {
      setPoll(await submitResponse(selected, prediction.pollId));
    } catch {
      setRoomUnavailable(true);
    }
  };

  if (!committed) {
    return (
      <section className="side-card prediction-vote" aria-labelledby="prediction-title">
        <p className="eyebrow">Commit first</p>
        <h2 id="prediction-title">{prediction.question}</h2>
        <form onSubmit={commit}>
          <fieldset>
            <legend className="sr-only">Choose one answer</legend>
            {prediction.options.map((option) => (
              <label key={option.id} className="poll-option">
                <input
                  type="radio"
                  name="prediction"
                  value={option.id}
                  checked={selected === option.id}
                  onChange={() => setSelected(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <button className="button primary full-width" type="submit" disabled={!selected}>
            Lock in prediction
          </button>
        </form>
        <p className="hint">The model controls and the charts unlock once you commit.</p>
      </section>
    );
  }

  const chosen = prediction.options.find((option) => option.id === committedOptionId);
  const correct = prediction.options.find((option) => option.id === prediction.correctOptionId);
  const wasRight = committedOptionId === prediction.correctOptionId;
  const roomTotal = poll?.responseCount ?? 0;

  return (
    <section className="side-card prediction-vote" aria-labelledby="prediction-title">
      <p className="eyebrow">{wasRight ? "You called it" : "Worth a second look"}</p>
      <h2 id="prediction-title">{prediction.question}</h2>
      <div aria-live="polite">
        <p className="prediction-verdict">
          You chose <strong>{chosen?.label ?? committedOptionId}</strong>. At the module's
          starting setting the answer is <strong>{correct?.label ?? prediction.correctOptionId}</strong>.
        </p>
        <div className="prediction-reveal">
          <h3>What changed?</h3>
          <p>{whatChanged}</p>
        </div>
        {!poll || roomUnavailable ? (
          <p className="hint">
            {roomUnavailable
              ? "Room answers are unavailable. Yours is recorded on this device, and every control still works."
              : "Loading the room's answers…"}
          </p>
        ) : (
          <>
            <h3>The room, so far</h3>
            <ul className="prediction-room">
              {poll.options.map((option) => (
                <li
                  key={option.id}
                  className={option.id === prediction.correctOptionId ? "is-correct" : undefined}
                >
                  <span>{option.label}</span>
                  <span>
                    {roomTotal > 0 ? Math.round((option.count / roomTotal) * 100) : 0}% ({option.count})
                  </span>
                </li>
              ))}
            </ul>
            <p className="hint">{roomTotal} aggregate responses. Counts only — no names or accounts.</p>
          </>
        )}
      </div>
    </section>
  );
}
