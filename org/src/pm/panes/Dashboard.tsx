/**
 * Dashboard pane — EVM metrics, Earned Schedule, forecasts.
 * Pure rendering from computed values — no side effects.
 */

import type { ProjectActions } from "../useProject";
import { computeEVM, computeES, fmtNum, idxClass, varClass } from "../engine";

interface Props {
  project: ProjectActions;
}

export function Dashboard({ project }: Props) {
  const { tasks } = project.state;
  const evm = computeEVM(tasks);
  const es = computeES(tasks);

  if (tasks.length === 0) {
    return (
      <div className="pm-empty">
        No tasks yet. Switch to the Tasks tab to add your first work package.
      </div>
    );
  }

  return (
    <div className="pm-dashboard">
      {/* EVM Metrics */}
      <section className="pm-section">
        <h2>Earned Value</h2>
        <div className="metric-grid">
          <Metric label="PV" value={fmtNum(evm.pv, 0)} cls="neutral" />
          <Metric label="EV" value={fmtNum(evm.ev, 0)} cls="neutral" />
          <Metric label="AC" value={fmtNum(evm.ac, 0)} cls="neutral" />
          <Metric label="CPI" value={fmtNum(evm.cpi, 2)} cls={idxClass(evm.cpi)} />
          <Metric label="SPI" value={fmtNum(evm.spi, 2)} cls={idxClass(evm.spi)} />
          <Metric label="BAC" value={fmtNum(evm.bac, 0)} cls="neutral" />
        </div>
      </section>

      {/* Earned Schedule */}
      <section className="pm-section">
        <h2>Earned Schedule</h2>
        <div className="metric-grid">
          <Metric label="ES" value={`${fmtNum(es.es)}d`} cls="neutral" />
          <Metric label="AT" value={`${fmtNum(es.at)}d`} cls="neutral" />
          <Metric label="SV(t)" value={`${fmtNum(es.svt)}d`} cls={varClass(es.svt)} />
          <Metric label="SPI(t)" value={fmtNum(es.spit, 2)} cls={idxClass(es.spit)} />
          <Metric label="SAC" value={`${fmtNum(es.sac)}d`} cls="neutral" />
          <Metric
            label="EAC(t)"
            value={`${fmtNum(es.eact)}d`}
            cls={es.eact > es.sac * 1.1 ? "bad" : es.eact > es.sac ? "warn" : "good"}
          />
        </div>
      </section>

      {/* Forecasts */}
      <section className="pm-section">
        <h2>Forecasts</h2>
        <div className="forecast-table">
          <ForecastRow label="EAC (cost)" value={fmtNum(evm.eac, 0)} cls={varClass(evm.vac)} />
          <ForecastRow label="ETC (remaining)" value={fmtNum(evm.etc, 0)} />
          <ForecastRow label="VAC (budget variance)" value={fmtNum(evm.vac, 0)} cls={varClass(evm.vac)} />
          <ForecastRow label="CV (cost variance)" value={fmtNum(evm.cv, 0)} cls={varClass(evm.cv)} />
          <ForecastRow label="SV (schedule variance)" value={fmtNum(evm.sv, 0)} cls={varClass(evm.sv)} />
          <ForecastRow label="EAC(t) (schedule forecast)" value={`${fmtNum(es.eact)} days`} />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="pm-metric">
      <div className="pm-metric-label">{label}</div>
      <div className={`pm-metric-value ${cls}`}>{value}</div>
    </div>
  );
}

function ForecastRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="pm-forecast-row">
      <span className="pm-forecast-label">{label}</span>
      <span className={cls || ""}>{value}</span>
    </div>
  );
}
