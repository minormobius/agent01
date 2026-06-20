// App store — a small React context holding the current dataset, the selected
// model + its editable config, the active run, and a session run-history
// (persisted to localStorage; the durable D1 experiment store lands in M2).
// Everything here operates on the contract objects and the harness output.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SYNTHETIC, type SyntheticConfig } from "../data/synthetic";
import { buildDataset, DATASET_PRESETS } from "../data/datasets";
import type { Dataset } from "../data/dataset";
import { MODEL_REGISTRY, getModel } from "../models/registry";
import { defaultConfig, type ModelConfig } from "../models/types";
import { DEFAULT_SPLIT, type SplitConfig } from "../harness/walkforward";
import type { RunRecord } from "../harness/types";

const RUNS_KEY = "speclab.runs.v1";

function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}
function saveRuns(runs: RunRecord[]) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, 25)));
  } catch {
    /* quota / unavailable — session-only */
  }
}

interface Store {
  // dataset
  datasetConfig: SyntheticConfig;
  setDatasetConfig: (c: SyntheticConfig) => void;
  dataset: Dataset;
  presets: typeof DATASET_PRESETS;

  // model
  modelName: string;
  setModelName: (n: string) => void;
  modelConfig: ModelConfig;
  setModelConfig: (c: ModelConfig) => void;
  models: typeof MODEL_REGISTRY;

  // split
  split: SplitConfig;
  setSplit: (s: SplitConfig) => void;

  // runs
  run: RunRecord | null;
  setRun: (r: RunRecord | null) => void;
  runs: RunRecord[];
  addRun: (r: RunRecord) => void;
  clearRuns: () => void;
  compareIds: string[];
  toggleCompare: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [datasetConfig, setDatasetConfig] = useState<SyntheticConfig>({ ...DEFAULT_SYNTHETIC, seed: "exo-bubble" });
  const [modelName, setModelNameRaw] = useState<string>("DivergenceRule");
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() =>
    defaultConfig(getModel("DivergenceRule")!.info),
  );
  const [split, setSplit] = useState<SplitConfig>(DEFAULT_SPLIT);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>(() => loadRuns());
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const dataset = useMemo(() => buildDataset(datasetConfig), [datasetConfig]);

  function setModelName(n: string) {
    setModelNameRaw(n);
    const m = getModel(n);
    if (m) {
      // prefill horizon from the dataset so calibration aligns with the event.
      const cfg = defaultConfig(m.info);
      if ("horizon" in cfg) cfg.horizon = datasetConfig.horizon;
      setModelConfig(cfg);
    }
  }

  function addRun(r: RunRecord) {
    setRuns((prev) => {
      const next = [r, ...prev].slice(0, 25);
      saveRuns(next);
      return next;
    });
  }
  function clearRuns() {
    setRuns([]);
    saveRuns([]);
    setCompareIds([]);
  }
  function toggleCompare(id: string) {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const value: Store = {
    datasetConfig,
    setDatasetConfig,
    dataset,
    presets: DATASET_PRESETS,
    modelName,
    setModelName,
    modelConfig,
    setModelConfig,
    models: MODEL_REGISTRY,
    split,
    setSplit,
    run,
    setRun,
    runs,
    addRun,
    clearRuns,
    compareIds,
    toggleCompare,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
