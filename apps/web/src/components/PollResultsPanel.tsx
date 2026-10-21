import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useState } from "react";
import { EChartPanel } from "./EChartPanel";
import { ExternalPollProjection } from "./ExternalPollPanel";
import { externalPoll, fetchPoll, pollMode, practicePollId, type Poll } from "../pollingClient";

const refreshMs = 5000;

type Props = {
  /** Defaults to the opening-segment poll; module predictions pass their own poll id. */
  pollId?: string;
  heading?: string;
  /**
   * The module's derived answer, when this panel is showing a prediction rather than an
   * opinion poll. The opening poll has no right answer and must not imply one.
   */
  correctOptionId?: string;
};

/**
 * Facilitator-side view of an aggregate poll.
 *
 * The workshop's synthesis segment claims that shared visualizations from the platform
 * highlight recurring patterns across the room. The participant panel only writes; this
 * is the surface that reads, so the facilitator has something to project while responses
 * come in and again during synthesis.
 *
 * Rendered through EChartPanel so it inherits the visually-hidden data table and the
 * prefers-reduced-motion handling the scenario charts already have — a poll result read
 * aloud from a screen reader is the same accessibility commitment as the modules.
 */
export function PollResultsPanel({ pollId = practicePollId, heading, correctOptionId }: Props) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [unavailable, setUnavailable] = useState(pollMode !== "backend");

  useEffect(() => {
    if (pollMode !== "backend") return;
    let cancelled = false;
    // Effect-scoped, not read from state: a closure over `poll` would be pinned to its
    // first-render value and report the service unavailable on any later blip.
    let everSucceeded = false;

    const refresh = () => {
      fetchPoll(pollId)
        .then((next) => {
          if (cancelled) return;
          everSucceeded = true;
          setPoll(next);
          // Recover silently — a dropped venue network should not permanently blank the
          // facilitator's screen once it comes back.
          setUnavailable(false);
        })
        .catch(() => {
          // Keep showing the last known counts once we have any; only a service that has
          // never answered is reported unavailable.
          if (!cancelled && !everSucceeded) setUnavailable(true);
        });
    };

    refresh();
    const timer = window.setInterval(refresh, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollId]);

  const option = useMemo<EChartsOption>(() => {
    const options = poll?.options ?? [];
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 64, right: 24, top: 24, bottom: 88 },
      xAxis: {
        type: "category",
        data: options.map((entry) => entry.label),
        axisLabel: { interval: 0, rotate: 20, width: 140, overflow: "break" }
      },
      yAxis: { type: "value", name: "Responses", minInterval: 1 },
      series: [{
        type: "bar",
        label: { show: true, position: "top" },
        data: options.map((entry) => ({
          value: entry.count,
          // Green marks the derived answer on a prediction poll, so the facilitator can
          // read the room's misconception straight off the projection.
          itemStyle: entry.id === correctOptionId ? { color: "#047857" } : undefined
        }))
      }]
    };
  }, [poll, correctOptionId]);

  if (unavailable) {
    // Covers external mode and, on a build carrying both, a backend that never answered.
    if (externalPoll && pollId === practicePollId) return <ExternalPollProjection poll={externalPoll} />;
    return (
      <section className="poll-panel" aria-labelledby={`poll-results-${pollId}`}>
        <h2 id={`poll-results-${pollId}`}>{heading ?? "Live poll results"}</h2>
        <p>
          {pollId === practicePollId
            ? "Polling is unavailable. Run the opening segment as a show of hands; every scenario module is unaffected."
            : "Polling is unavailable, so the room's predictions cannot be projected. Ask for a show of hands before revealing; the module itself is unaffected."}
        </p>
      </section>
    );
  }

  if (!poll) {
    return <p role="status">Loading live poll results…</p>;
  }

  const correct = poll.options.find((entry) => entry.id === correctOptionId);
  const correctShare = correct && poll.responseCount > 0
    ? Math.round((correct.count / poll.responseCount) * 100)
    : undefined;

  return (
    <section className="poll-results" aria-labelledby={`poll-results-${pollId}`}>
      <div className="section-heading compact">
        <p className="eyebrow" id={`poll-results-${pollId}`}>
          {heading ?? "Live poll"} · {poll.responseCount} responses · refreshes every {refreshMs / 1000}s
        </p>
        <h2>{poll.question}</h2>
        {correct && (
          <p>
            Derived answer: <strong>{correct.label}</strong>
            {correctShare !== undefined && ` — ${correctShare}% of the room agreed`}
          </p>
        )}
      </div>
      <EChartPanel
        title={heading ?? "Opening poll responses"}
        description="Aggregate counts only. No names, accounts, or identifying information are collected."
        option={option}
        tableRows={poll.options.map((entry) => ({
          Response: entry.label,
          Count: entry.count,
          ...(correctOptionId ? { Answer: entry.id === correctOptionId } : {})
        }))}
      />
    </section>
  );
}
