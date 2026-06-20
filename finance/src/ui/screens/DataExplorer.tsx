import { useStore } from "../../app/store";
import { StreamChart } from "../charts/StreamChart";
import type { SyntheticConfig } from "../../data/synthetic";

export function DataExplorer({ onRun }: { onRun: () => void }) {
  const { datasetConfig, setDatasetConfig, dataset, presets } = useStore();

  const patch = (p: Partial<SyntheticConfig>) => setDatasetConfig({ ...datasetConfig, ...p });
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
        <h2>Dataset</h2>
        <p className="desc">
          Synthetic coupled asset + prediction-market streams from a known, planted feedback
          structure. Real-data adapters (price feeds, Kalshi/Polymarket) plug in behind this same
          interface in a later milestone.
        </p>
        <div className="row">
          {presets.map((p) => (
            <button
              key={p.key}
              className={`btn small ${datasetConfig.seed === p.config.seed ? "" : "ghost"}`}
              onClick={() => setDatasetConfig(p.config)}
              title={p.blurb}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Streams</h2>
        <StreamChart dataset={dataset} />
        <h3>Stream metadata</h3>
        <table className="runs">
          <thead>
            <tr>
              <th>id</th>
              <th>kind</th>
              <th>exogeneity</th>
              <th>obs</th>
              <th>linkage</th>
              <th></th>
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
                      s.meta.exogeneity === "EXOGENOUS"
                        ? "exo"
                        : s.meta.exogeneity === "ENDOGENOUS"
                          ? "endo"
                          : "unk"
                    }`}
                  >
                    {s.meta.exogeneity}
                  </span>
                </td>
                <td className="num">{s.observations.length}</td>
                <td className="muted small">{s.meta.linkage_note ?? "—"}</td>
                <td>
                  {s.kind === "PREDICTION_MARKET" && (
                    <button
                      className="btn small ghost"
                      onClick={() =>
                        patch({ pmExogeneity: exo === "EXOGENOUS" ? "ENDOGENOUS" : "EXOGENOUS" })
                      }
                    >
                      flip → {exo === "EXOGENOUS" ? "ENDOGENOUS" : "EXOGENOUS"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 10 }}>
          Exogeneity is a first-class, flippable attribute. For synthetic data, flipping it
          regenerates the world: an <b>exogenous</b> PM genuinely knows the planted future; an{" "}
          <b>endogenous</b> PM is a noisy, herding mirror of the asset. Whether that distinction is
          exploitable is exactly what you re-run to find out.
        </p>
      </div>

      <div className="card">
        <h2>Generator parameters</h2>
        <div className="grid cols-3">
          <label className="field">
            <span>seed</span>
            <input value={datasetConfig.seed} onChange={(e) => patch({ seed: e.target.value })} />
          </label>
          {num("steps", "steps", 60, 1200, 10)}
          {num("horizon", "event horizon (steps)", 1, 60, 1)}
          {num("strike", "strike (cum. return)", 0, 0.5, 0.01)}
          {num("pmInfoStrength", "PM info strength (0..1)", 0, 1, 0.05)}
          {num("pmNoise", "PM noise", 0, 0.3, 0.01)}
          {num("herding", "herding (endogenous)", 0, 2, 0.05)}
          {num("assetVol", "asset vol", 0.001, 0.05, 0.001)}
          {num("covariateLagSteps", "covariate knowledge lag", 0, 10, 1)}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onRun}>
            Run a backtest →
          </button>
          <span className="small muted">
            {dataset.steps} steps · PM is {exo.toLowerCase()} · horizon {dataset.horizon} · strike{" "}
            {dataset.strike}
          </span>
        </div>
      </div>
    </>
  );
}
