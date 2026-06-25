// Read-only helpers for pulling typed views out of an InputBundle. Models use
// these so they touch only what the contract exposes.

import type { InputBundle, Stream } from "../contracts/schema";

export function streamsByKind(bundle: InputBundle, kind: Stream["kind"]): Stream[] {
  return bundle.streams.filter((s) => s.kind === kind);
}

export function firstAssetStream(bundle: InputBundle): Stream | null {
  return streamsByKind(bundle, "ASSET_PRICE")[0] ?? null;
}

export function firstPmStream(bundle: InputBundle): Stream | null {
  return streamsByKind(bundle, "PREDICTION_MARKET")[0] ?? null;
}

/** Ordered value series of a stream (by event_time, already look-ahead-filtered). */
export function valueSeries(stream: Stream): number[] {
  return [...stream.observations]
    .sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time))
    .map((o) => o.value);
}

/** Most recent value of a stream as of the bundle's decision_time, or null. */
export function latestValue(stream: Stream | null): number | null {
  if (!stream || stream.observations.length === 0) return null;
  let best = stream.observations[0];
  for (const o of stream.observations) {
    if (Date.parse(o.knowledge_time) >= Date.parse(best.knowledge_time)) best = o;
  }
  return best.value;
}
