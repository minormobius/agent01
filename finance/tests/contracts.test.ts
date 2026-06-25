import { describe, it, expect } from "vitest";
import {
  parseInputBundle,
  parseOutputBundle,
  regimePosteriorIssue,
  BUNDLE_SCHEMA_VERSION,
} from "../src/contracts/schema";
import { generateSynthetic, DEFAULT_SYNTHETIC } from "../src/data/synthetic";
import { MODEL_REGISTRY } from "../src/models/registry";
import { defaultConfig } from "../src/models/types";
import { visibleBundle } from "../src/harness/lookahead";

const ds = generateSynthetic({ ...DEFAULT_SYNTHETIC, steps: 80, seed: "contract-test" });

describe("InputBundle contract", () => {
  it("the synthetic generator emits a contract-valid InputBundle", () => {
    expect(() => parseInputBundle(ds.fullBundle)).not.toThrow();
  });

  it("rejects a bundle with the wrong schema version", () => {
    const bad = { ...ds.fullBundle, bundle_schema_version: "0.0.0" };
    expect(() => parseInputBundle(bad)).toThrow();
  });
});

describe("OutputBundle contract", () => {
  it("every registered model emits a contract-valid OutputBundle", () => {
    const bundle = visibleBundle(ds.fullBundle, ds.decisionTimes[60]);
    for (const m of MODEL_REGISTRY) {
      const out = m.predict(bundle, defaultConfig(m.info));
      expect(() => parseOutputBundle(out), m.info.name).not.toThrow();
      expect(out.bundle_schema_version).toBe(BUNDLE_SCHEMA_VERSION);
    }
  });
});

describe("regime posterior validation", () => {
  it("accepts an empty posterior", () => {
    expect(regimePosteriorIssue({})).toBeNull();
  });
  it("accepts a posterior summing to 1", () => {
    expect(regimePosteriorIssue({ a: 0.3, b: 0.7 })).toBeNull();
  });
  it("flags a posterior that does not sum to 1", () => {
    expect(regimePosteriorIssue({ a: 0.3, b: 0.3 })).not.toBeNull();
  });
});
