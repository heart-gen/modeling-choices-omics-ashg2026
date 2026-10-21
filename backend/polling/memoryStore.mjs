import { buildSnapshot, isKnownOption, polls, requirePoll } from "./poll.mjs";

/**
 * Single-process, in-memory counts. Adequate for local development and for the load
 * check in tests/polling-load.mjs; a deployed session uses DynamoPollStore so counts
 * survive restarts and more than one instance.
 */
export class MemoryPollStore {
  #counts = new Map(
    [...polls.values()].map((poll) => [poll.id, new Map(poll.options.map((option) => [option.id, 0]))])
  );

  async respond(pollId, optionId) {
    const poll = requirePoll(pollId);
    if (!isKnownOption(poll, optionId)) {
      throw new Error("Unknown poll option");
    }
    const counts = this.#counts.get(poll.id);
    counts.set(optionId, counts.get(optionId) + 1);
    return this.snapshot(poll.id);
  }

  async snapshot(pollId) {
    const poll = requirePoll(pollId);
    return buildSnapshot(poll, this.#counts.get(poll.id));
  }

  async reset() {
    for (const counts of this.#counts.values()) {
      for (const optionId of counts.keys()) counts.set(optionId, 0);
    }
  }
}
