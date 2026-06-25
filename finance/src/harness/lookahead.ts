// THE LOOK-AHEAD GUARANTEE.
//
// No model may ever observe a value whose knowledge_time is after the bundle's
// decision_time. The harness builds every InputBundle by slicing full streams
// through visibleBundle(), and assertNoLookahead() is the belt-and-suspenders
// check that the contract held. tests/leakage.test.ts pins this behaviour.

import { asMs } from "../contracts/schema";
import type { InputBundle, Observation, Stream } from "../contracts/schema";

export class LookaheadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookaheadError";
  }
}

/**
 * Return a copy of `full` as it was knowable at `decisionTime`: every stream's
 * observations are filtered to knowledge_time <= decisionTime. The result's
 * decision_time is set to `decisionTime`.
 */
export function visibleBundle(full: InputBundle, decisionTime: string): InputBundle {
  const cutoff = asMs(decisionTime);
  const streams: Stream[] = full.streams.map((s) => ({
    ...s,
    observations: s.observations.filter((o: Observation) => asMs(o.knowledge_time) <= cutoff),
  }));
  return {
    bundle_schema_version: full.bundle_schema_version,
    decision_time: decisionTime,
    streams,
  };
}

/** Throw if any observation in the bundle was not yet knowable at decision_time. */
export function assertNoLookahead(bundle: InputBundle): void {
  const cutoff = asMs(bundle.decision_time);
  for (const s of bundle.streams) {
    for (const o of s.observations) {
      if (asMs(o.knowledge_time) > cutoff) {
        throw new LookaheadError(
          `stream "${s.id}" exposes an observation (knowledge_time=${o.knowledge_time}) ` +
            `after decision_time=${bundle.decision_time}`,
        );
      }
    }
  }
}
