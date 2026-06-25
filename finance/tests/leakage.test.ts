import { describe, it, expect } from "vitest";
import { generateSynthetic, DEFAULT_SYNTHETIC } from "../src/data/synthetic";
import { visibleBundle, assertNoLookahead, LookaheadError } from "../src/harness/lookahead";
import { purgedTrainIndices, runBacktest, DEFAULT_SPLIT } from "../src/harness/walkforward";
import { asMs } from "../src/contracts/schema";
import { DivergenceRule } from "../src/models/divergenceRule";
import { defaultConfig } from "../src/models/types";

const ds = generateSynthetic({ ...DEFAULT_SYNTHETIC, steps: 120, seed: "leak-test" });

describe("look-ahead guarantee", () => {
  it("visibleBundle never exposes an observation knowable after decision_time", () => {
    for (let t = 0; t < ds.steps; t += 7) {
      const dt = ds.decisionTimes[t];
      const b = visibleBundle(ds.fullBundle, dt);
      const cutoff = asMs(dt);
      for (const s of b.streams) {
        for (const o of s.observations) {
          expect(asMs(o.knowledge_time)).toBeLessThanOrEqual(cutoff);
        }
      }
    }
  });

  it("the lagged covariate is correctly withheld until knowable", () => {
    // covariate is published with a 1-step lag by default, so at decision step t
    // the covariate observation for event_time t is NOT yet visible.
    const t = 40;
    const b = visibleBundle(ds.fullBundle, ds.decisionTimes[t]);
    const cov = b.streams.find((s) => s.id === "covariate")!;
    const lastEvent = cov.observations.reduce(
      (m, o) => Math.max(m, asMs(o.event_time)),
      -Infinity,
    );
    // newest covariate event_time visible is strictly before the decision time
    expect(lastEvent).toBeLessThan(asMs(ds.decisionTimes[t]));
  });

  it("assertNoLookahead throws on a hand-crafted leaky bundle", () => {
    const b = visibleBundle(ds.fullBundle, ds.decisionTimes[10]);
    b.streams[0].observations.push({
      event_time: ds.decisionTimes[50],
      knowledge_time: ds.decisionTimes[50], // after decision_time
      value: 999,
    });
    expect(() => assertNoLookahead(b)).toThrow(LookaheadError);
  });

  it("a full backtest passes the per-step look-ahead assertion", () => {
    expect(() =>
      runBacktest({ dataset: ds, model: DivergenceRule, config: defaultConfig(DivergenceRule.info) }),
    ).not.toThrow();
  });
});

describe("purged + embargoed splits", () => {
  const horizon = 10;
  it("no training label window overlaps the test point (purge + embargo)", () => {
    for (const testStep of [60, 80, 100]) {
      const idx = purgedTrainIndices(testStep, horizon, DEFAULT_SPLIT);
      for (const s of idx) {
        expect(s + horizon).toBeLessThan(testStep - DEFAULT_SPLIT.embargo);
        expect(s).toBeGreaterThanOrEqual(DEFAULT_SPLIT.warmup);
      }
    }
  });

  it("rolling scheme caps the training window length", () => {
    const split = { ...DEFAULT_SPLIT, scheme: "rolling" as const, trainWindow: 20 };
    const idx = purgedTrainIndices(120, horizon, split);
    expect(idx.length).toBeLessThanOrEqual(20);
  });
});
