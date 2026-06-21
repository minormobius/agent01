import { useStore } from "../../app/store";
import { StreamChart } from "../charts/StreamChart";
import type { SyntheticConfig } from "../../data/synthetic";
import type { BtcOptions, PmMode } from "../../data/btc";

export function DataExplorer({ onRun }: { onRun: () => void }) {
  const {
    datasetSource,
    datasetConfig,
    setDatasetConfig,
    btcOptions,
    setBtcOptions,
    loadBtc,
    dataset,
    datasetLoading,
    datasetError,
    presets,
  } = useStore();

  const patch = (p: Partial<SyntheticConfig>) => setDatasetConfig({ ...datasetConfig, ...p });
  const bpatch = (p: Partial<BtcOptions>) => setBtcOptions({ ...btcOptions, ...p });
  const num = (key: keyof SyntheticConfig, label: string, min: number, max: number, step: number) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(datasetConfig[key])}
        min={min}
        max={max}
        step={step}
        onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<SyntheticConfig>)}
      />
    </label>
  );

  const exo = datasetConfig.pmExogeneity;

  return (
    <>
      <div className="card">
        <h2>Real data · BTC-USD</h2>
        <p className="desc">
          Real daily BTC-USD prices (Coinbase, proxied through the worker). The asset path is real;
          the linked prediction market has three honest provenances — pick one and load.
        </p>
        <div className="grid cols-3">
          <label className="field">
            <span>PM provenance</span>
            <select value={btcOptions.pmMode} onChange={(e) => bpatch({ pmMode: e.target.value as PmMode })}>
              <option value="exo">semi-synthetic · exogenous overlay</option>
              <option value="endo">semi-synthetic · endogenous overlay</option>
              <option value="live">real Kalshi snapshots (forward-accruing)</option>
            </select>
          </label>
          <label className="field">
            <span>event horizon (days)</span>
            <input type="number" min={1} max={60} value={btcOptions.horizon} onChange={(e) => bpatch({ horizon: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>strike (cum. return)</span>
            <input type="number" min={0} max={0.5} step={0.01} value={btcOptions.strike} onChange={(e) => bpatch({ strike: Number(e.target.value) })} />
          </label>
          {btcOptions.pmMode === "exo" && (
            <label className="field">
              <span>PM info strength</span>
              <input type="number" min={0} max={1} step={0.05} value={btcOptions.pmInfoStrength} onChange={(e) => bpatch({ pmInfoStrength: Number(e.target.value) })} />
            </label>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => loadBtc()} disabled={datasetLoading}>
            {datasetLoading ? "loading real BTC…" : "Load real BTC"}
          </button>
          {datasetError && <span className="small" style={{ color: "var(--bad)" }}>error: {datasetError}</span>}
          {datasetSource === "btc" && !datasetLoading && !datasetError && (
            <span className="small" style={{ color: "var(--good)" }}>✓ active: {dataset.label}</span>
          )}
        </div>
        {btcOptions.pmMode === "live" && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Liquid daily BTC PM history isn't freely backfillable, so the real Kalshi series accrues
            forward from an hourly cron — it will be sparse until it has run for a while. The
            semi-synthetic overlays let you exercise the full pipeline on real prices today.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Streams {datasetSource === "btc" ? "· real BTC" : "· synthetic"}</h2>
        <StreamChart dataset={dataset} />
        <h3>Stream metadata</h3>
        <table className="runs">
          <thead>
            <tr>
              <th>id</th>
              <th>kind</th>
              <th>exogeneity</th>
              <th>obs</th>
              <th>linkage / provenance</th>
            </tr>
          </thead>
          <tbody>
            {dataset.fullBundle.streams.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.id}</td>
                <td className="mono">{s.kind}</td>
                <td>
                  <span
                    className={`chip ${
                      s.meta.exogeneity === "EXOGENOUS" ? "exo" : s.meta.exogeneity === "ENDOGENOUS" ? "endo" : "unk"
                    }`}
                  >
                    {s.meta.exogeneity}
                  </span>
                </td>
                <td className="num">{s.observations.length}</td>
                <td className="muted small">{s.meta.linkage_note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 10 }}>
          Exogeneity is declared here, but on real data it's something you <b>measure</b>, not set —
          the run's <b>exogeneity verdict</b> (Results) estimates whether the PM leads the
          asset-implied probability (informative) or lags it (a reflective mirror).
        </p>
      </div>

      <div className="card">
        <h2>Synthetic generator</h2>
        <p className="desc">Coupled asset + PM streams from a known, planted feedback structure.</p>
        <div className="row">
          {presets.map((p) => (
            <button
              key={p.key}
              className={`btn small ${datasetSource === "synthetic" && datasetConfig.seed === p.config.seed ? "" : "ghost"}`}
              onClick={() => setDatasetConfig(p.config)}
              title={p.blurb}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid cols-3" style={{ marginTop: 12 }}>
          <label className="field">
            <span>seed</span>
            <input value={datasetConfig.seed} onChange={(e) => patch({ seed: e.target.value })} />
          </label>
          {num("steps", "steps", 60, 1200, 10)}
          {num("horizon", "event horizon (steps)", 1, 60, 1)}
          {num("pmInfoStrength", "PM info strength", 0, 1, 0.05)}
          {num("pmNoise", "PM noise", 0, 0.3, 0.01)}
          {num("covariateLagSteps", "covariate knowledge lag", 0, 10, 1)}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn small ghost"
            onClick={() => setDatasetConfig({ ...datasetConfig, pmExogeneity: exo === "EXOGENOUS" ? "ENDOGENOUS" : "EXOGENOUS" })}
          >
            flip PM → {exo === "EXOGENOUS" ? "ENDOGENOUS" : "EXOGENOUS"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <span className="small muted">
            active: {dataset.steps} steps · horizon {dataset.horizon} · strike {dataset.strike} ·{" "}
            {dataset.source}
          </span>
          <button className="btn" onClick={onRun}>
            Run a backtest →
          </button>
        </div>
      </div>
    </>
  );
}
