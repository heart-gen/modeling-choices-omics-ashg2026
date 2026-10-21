import type { ExternalPoll } from "../pollingClient";

/**
 * The backup-deployment poll surface.
 *
 * When the platform ships without its own polling backend — the GitHub Pages contingency
 * in `deploy/README.md` — the opening segment runs on a hosted poll tool instead. There is
 * no read API for a third-party poll, so this points at it rather than charting it: the
 * facilitator reads counts from the tool's own presenter view.
 */

/** A projected or read-aloud URL does not need its scheme. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function ExternalPollPrompt({ poll }: { poll: ExternalPoll }) {
  return (
    <section className="poll-panel" aria-labelledby="live-poll-title">
      <h2 id="live-poll-title">Live practice poll</h2>
      <p>{poll.question}</p>
      <a
        className="button secondary full-width"
        href={poll.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open the poll
      </a>
      <p className="poll-url">{poll.label ?? displayUrl(poll.url)}</p>
      <p className="poll-hint">
        Opens in a new tab and collects aggregate answers only. Every scenario module works
        whether or not you answer.
      </p>
    </section>
  );
}

/** Projected during the opening segment, so the join link has to carry the room. */
export function ExternalPollProjection({ poll }: { poll: ExternalPoll }) {
  return (
    <section className="poll-results external-poll" aria-labelledby="poll-results-title">
      <div className="section-heading compact">
        <p className="eyebrow" id="poll-results-title">Opening poll · external tool</p>
        <h2>{poll.question}</h2>
      </div>
      <p className="external-poll-url">{poll.label ?? displayUrl(poll.url)}</p>
      <ol className="external-poll-steps">
        <li>Project this panel and read the join link aloud while responses come in.</li>
        <li>
          Open the poll tool&rsquo;s results view in a second window
          {poll.resultsUrl ? (
            <>
              {" "}
              (
              <a href={poll.resultsUrl} target="_blank" rel="noopener noreferrer">
                presenter view
              </a>
              )
            </>
          ) : null}
          , and project that during synthesis.
        </li>
        <li>Counts do not appear in this platform on the backup deployment; the tool holds them.</li>
      </ol>
    </section>
  );
}
