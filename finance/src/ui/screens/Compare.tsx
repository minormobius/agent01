import { useState } from "react";
import { useStore } from "../../app/store";
import type { RunRecord } from "../../harness/types";

const f = (x: number | null, d = 3) => (x == null ? "—" : x.toFixed(d));

export function Compare({ onOpen }: { onOpen: () => void }) {
  const { runs, setRun, clearRuns, storeBackend } = useStore();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const toggleCompare = (id: string) =>
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selected = runs.filter((r) => compareIds.includes(r.id));

  if (runs.length === 0) {
    return (
      <div className="card">
        <div className="placeholder">No runs logged yet. Launch a backtest and it shows up here.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <div>
            <h2>Experiment log</h2>
            <p className="desc">
              Every run is recorded with model, config, dataset, contract version, and all metrics.
              Tick rows to compare. Backend:{" "}
              <span className="chip mono">{storeBackend === "d1" ? "D1 (durable, cross-device)" : "localStorage (fallback)"}</span>
            </p>
          </div>
          <button className="btn ghost small" onClick={clearRuns}>clear</button>
        </div>
        <table className="runs">
          <thead>
            <tr>
              <th>cmp</th>
              <th>model</th>
              <th>dataset</th>
              <th>Brier · model</th>
              <th>Brier · PM</th>
              <th>Sharpe</th>
              <th>P&L</th>
              <th>abstain</th>
              <th>when</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={compareIds.includes(r.id)}
                    onChange={() => toggleCompare(r.id)}
                  />
                </td>
                <td className="mono">{r.modelName}</td>
                <td className="small">{r.datasetLabel}</td>
                <td className="num">{f(r.metrics.brierModel, 4)}</td>
                <td className="num">{f(r.metrics.brierPm, 4)}</td>
                <td className="num">{f(r.metrics.sharpe)}</td>
                <td className="num">{f(r.metrics.totalReturn, 4)}</td>
                <td className="num">{(r.metrics.abstainRate * 100).toFixed(0)}%</td>
                <td className="muted small">{new Date(r.createdAt).toLocaleTimeString()}</td>
                <td>
                  <button className="btn small ghost" onClick={() => { setRun(r); onOpen(); }}>
                    open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected.length >= 2 && (
        <div className="card">
          <h2>Side-by-side</h2>
          <table className="runs">
            <thead>
              <tr>
                <th>metric</th>
                {selected.map((r) => (
                  <th key={r.id} className="num">{r.modelName}<br /><span className="muted">{r.id.slice(-5)}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRow("Brier · model", selected, (r) => f(r.metrics.brierModel, 4))}
              {metricRow("Brier · PM", selected, (r) => f(r.metrics.brierPm, 4))}
              {metricRow("Sharpe", selected, (r) => f(r.metrics.sharpe))}
              {metricRow("active Sharpe", selected, (r) => f(r.metrics.activeSharpe))}
              {metricRow("total P&L", selected, (r) => f(r.metrics.totalReturn, 4))}
              {metricRow("max drawdown", selected, (r) => f(r.metrics.maxDrawdown, 4))}
              {metricRow("abstain rate", selected, (r) => `${(r.metrics.abstainRate * 100).toFixed(0)}%`)}
              {metricRow("regime hit-rate", selected, (r) => f(r.metrics.regimeHitRate))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function metricRow(label: string, runs: RunRecord[], get: (r: RunRecord) => string) {
  return (
    <tr>
      <td className="muted">{label}</td>
      {runs.map((r) => (
        <td key={r.id} className="num">{get(r)}</td>
      ))}
    </tr>
  );
}
