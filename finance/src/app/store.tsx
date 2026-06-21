// App store — current dataset (synthetic OR real BTC, the latter loaded async),
// the selected model + editable config, the active run, and run history backed
// by the worker experiment store (D1) with a localStorage fallback.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SYNTHETIC, type SyntheticConfig } from "../data/synthetic";
import { buildDataset, DATASET_PRESETS } from "../data/datasets";
import { fetchBtcDataset, DEFAULT_BTC, type BtcOptions } from "../data/btc";
import type { Dataset } from "../data/dataset";
import { MODEL_REGISTRY, getModel } from "../models/registry";
import { defaultConfig, type ModelConfig } from "../models/types";
import { DEFAULT_SPLIT, type SplitConfig } from "../harness/walkforward";
import type { RunRecord } from "../harness/types";
import { apiListRuns, apiSaveRun, apiDeleteRun } from "../lib/api";

const RUNS_KEY = "speclab.runs.v1";

function loadLocalRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}
function saveLocalRuns(runs: RunRecord[]) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, 25)));
  } catch {
    /* quota / unavailable */
  }
}

export type DatasetSource = "synthetic" | "btc";

interface Store {
  datasetSource: DatasetSource;
  datasetConfig: SyntheticConfig;
  setDatasetConfig: (c: SyntheticConfig) => void;
  btcOptions: BtcOptions;
  setBtcOptions: (o: BtcOptions) => void;
  loadBtc: (o?: BtcOptions) => void;
  dataset: Dataset;
  datasetLoading: boolean;
  datasetError: string | null;
  presets: typeof DATASET_PRESETS;

  modelName: string;
  setModelName: (n: string) => void;
  modelConfig: ModelConfig;
  setModelConfig: (c: ModelConfig) => void;
  models: typeof MODEL_REGISTRY;

  split: SplitConfig;
  setSplit: (s: SplitConfig) => void;

  run: RunRecord | null;
  setRun: (r: RunRecord | null) => void;
  runs: RunRecord[];
  addRun: (r: RunRecord) => void;
  clearRuns: () => void;
  storeBackend: "d1" | "local";
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [datasetSource, setDatasetSource] = useState<DatasetSource>("synthetic");
  const [datasetConfig, setDatasetConfigRaw] = useState<SyntheticConfig>({ ...DEFAULT_SYNTHETIC, seed: "exo-bubble" });
  const [btcOptions, setBtcOptions] = useState<BtcOptions>(DEFAULT_BTC);
  const [dataset, setDataset] = useState<Dataset>(() => buildDataset({ ...DEFAULT_SYNTHETIC, seed: "exo-bubble" }));
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  const [modelName, setModelNameRaw] = useState<string>("DivergenceRule");
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => defaultConfig(getModel("DivergenceRule")!.info));
  const [split, setSplit] = useState<SplitConfig>(DEFAULT_SPLIT);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [storeBackend, setStoreBackend] = useState<"d1" | "local">("local");

  // hydrate runs from the backend, falling back to localStorage
  useEffect(() => {
    let alive = true;
    apiListRuns().then((remote) => {
      if (!alive) return;
      if (remote === null) {
        // backend unreachable -> localStorage
        setRuns(loadLocalRuns());
        return;
      }
      // backend reachable: it is the source of truth (even when empty)
      setStoreBackend("d1");
      setRuns(remote.length > 0 ? remote : loadLocalRuns());
    });
    return () => {
      alive = false;
    };
  }, []);

  function setDatasetConfig(c: SyntheticConfig) {
    setDatasetSource("synthetic");
    setDatasetConfigRaw(c);
    setDatasetError(null);
    setDataset(buildDataset(c));
  }

  function loadBtc(o?: BtcOptions) {
    const opts = o ?? btcOptions;
    setBtcOptions(opts);
    setDatasetSource("btc");
    setDatasetLoading(true);
    setDatasetError(null);
    fetchBtcDataset(opts)
      .then((ds) => {
        setDataset(ds);
        setModelConfig((mc) => ("horizon" in mc ? { ...mc, horizon: ds.horizon } : mc));
      })
      .catch((e) => setDatasetError(String(e && e.message ? e.message : e)))
      .finally(() => setDatasetLoading(false));
  }

  function setModelName(n: string) {
    setModelNameRaw(n);
    const m = getModel(n);
    if (m) {
      const cfg = defaultConfig(m.info);
      if ("horizon" in cfg) cfg.horizon = dataset.horizon;
      setModelConfig(cfg);
    }
  }

  function addRun(r: RunRecord) {
    setRuns((prev) => {
      const next = [r, ...prev].slice(0, 50);
      saveLocalRuns(next);
      return next;
    });
    apiSaveRun(r).then((ok) => {
      if (ok) setStoreBackend("d1");
    });
  }
  function clearRuns() {
    runs.forEach((r) => apiDeleteRun(r.id));
    setRuns([]);
    saveLocalRuns([]);
  }

  const value: Store = useMemo(
    () => ({
      datasetSource,
      datasetConfig,
      setDatasetConfig,
      btcOptions,
      setBtcOptions,
      loadBtc,
      dataset,
      datasetLoading,
      datasetError,
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
      storeBackend,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetSource, datasetConfig, btcOptions, dataset, datasetLoading, datasetError, modelName, modelConfig, split, run, runs, storeBackend],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
