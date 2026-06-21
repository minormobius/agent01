import { Stat } from "../components";
import { EquityChart } from "../charts/EquityChart";
import { ReliabilityChart } from "../charts/ReliabilityChart";
import { DivergenceChart } from "../charts/DivergenceChart";
import { RegimeTimeline } from "../charts/RegimeTimeline";
import type { RunRecord } from "../../harness/types";

const f = (x: number | null, d = 3) => (x == null ? "—" : x.toFixed(d));
const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

export function Results({ run, onGoRun }: { run: RunRecord | null; onGoRun: () => void }) {
  if (!run) {
    return (
      <div className="card">
        <div className="placeholder">
          No run yet. <a onClick={onGoRun} style={{ cursor: "pointer" }}>Launch a backtest →</a>
        </div>
      </div>
    );
  }
  const m = run.metrics;
  const beatsPm = m.brierModel != null && m.brierPm != null ? m.brierModel < m.brierPm : null;

  return (
    <>
      <div className="card">
        <div className="row between">
          <div>
            <h2>{run.modelName} · {run.datasetLabel}</h2>
            <p className="desc mono small">
              {run.id} · contract v{run.contractVersion} · {new Date(run.createdAt).toLocaleString()}
            </p>
          </div>
          <button className="btn ghost small" onClick={onGoRun}>← new run</button>
        </div>

        <h3>Calibration — the primary honesty metric</h3>
        <div className="grid cols-3">
          <Stat
            k="Brier · model"
            v={f(m.brierModel, 4)}
            sub={`${m.nScored} scored events`}
            tone={beatsPm === true ? "good" : beatsPm === false ? "bad" : undefined}
          />
          <Stat k="Brier · raw PM (baseline)" v={f(m.brierPm, 4)} sub="the baseline to beat" />
          <Stat
            k="verdict"
            v={beatsPm == null ? "n/a" : beatsPm ? "model beats PM" : "PM wins"}
            sub="lower Brier is better"
            tone={beatsPm === true ? "good" : beatsPm === false ? "bad" : undefined}
          />
        </div>

        <h3>Exogeneity — measured, not declared</h3>
        <div className="grid cols-3">
          <Stat
            k="verdict"
            v={m.exogeneityVerdict ?? "—"}
            sub="lead-lag of PM vs asset-implied"
            tone={m.exogeneityVerdict === "exogenous-leaning" ? "good" : m.exogeneityVerdict === "endogenous-leaning" ? "bad" : undefined}
          />
          <Stat k="score" v={f(m.exogeneityScore)} sub="leadCorr − lagCorr ∈ [−1,1]" />
          <Stat
            k="best lag"
            v={m.exogeneityLag == null ? "—" : `${m.exogeneityLag > 0 ? "+" : ""}${m.exogeneityLag}`}
            sub={m.exogeneityLag == null ? "" : m.exogeneityLag > 0 ? "PM leads (informative)" : "PM lags (mirror)"}
          />
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          A positive score / positive lag means the prediction market moves <i>before</i> the
          asset-implied probability — it carries information the asset hasn't priced. Negative means
          it's a reflective, herding mirror. This is the realism test: on real data exogeneity is an
          estimate, not a setting.
        </p>

        <h3>Economic (forward-looking · abstention-aware)</h3>
        <div className="grid cols-3">
          <Stat k="total P&L" v={f(m.totalReturn, 4)} tone={m.totalReturn >= 0 ? "good" : "bad"} />
          <Stat k="Sharpe (all steps)" v={f(m.sharpe)} sub={`active: ${f(m.activeSharpe)}`} />
          <Stat k="max drawdown" v={f(m.maxDrawdown, 4)} tone="bad" />
          <Stat k="abstain rate" v={pct(m.abstainRate)} sub={`${m.nActive} active steps`} />
          <Stat k="trade win rate" v={pct(m.tradeWinRate)} />
          <Stat k="regime hit-rate" v={pct(m.regimeHitRate)} sub="vs ground truth" />
        </div>

        <h3>Overfitting diagnostics</h3>
        <div className="grid cols-2">
          <Stat k="deflated Sharpe ratio" v="— (M2)" sub="needs a config search" />
          <Stat k="PBO (prob. backtest overfit)" v="— (M2)" sub="CSCV across the search" />
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Deflated Sharpe and PBO quantify overfitting across a <i>search</i> over configs — they
          are meaningless for a single run, so they activate once the experiment store and a config
          sweep land (milestone 2). They will be unavoidable in this view, by design.
        </p>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Equity curve</h2>
          <EquityChart series={run.series} />
        </div>
        <div className="card">
          <h2>Reliability — model vs raw PM</h2>
          <ReliabilityChart model={m.reliabilityModel} pm={m.reliabilityPm} />
          <p className="small muted">Points on the dashed 45° line are perfectly calibrated; bubble size = count.</p>
        </div>
      </div>

      <div className="card">
        <h2>Divergence — PM-implied vs asset-implied</h2>
        <DivergenceChart series={run.series} />
      </div>

      {run.regimeNames.length > 0 ? (
        <div className="card">
          <h2>Regime timeline vs ground truth</h2>
          <RegimeTimeline series={run.series} regimeNames={run.regimeNames} />
        </div>
      ) : (
        <div className="card">
          <h2>Regime timeline</h2>
          <p className="muted small">
            No ground-truth regimes on real data. A regime detector (HMMRegime, M3) would populate a
            predicted band here; for now calibration and the exogeneity verdict carry the analysis.
          </p>
        </div>
      )}
    </>
  );
}
