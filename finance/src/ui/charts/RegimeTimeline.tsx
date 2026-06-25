import { regimeColorMap } from "../colors";
import type { RunSeries } from "../../harness/types";

// Regime timeline: ground-truth band (top) and the model's predicted regime
// (bottom). Seed models (BaselineAbstain, DivergenceRule) emit no regime
// posterior, so the predicted band reads "no regime model" until a regime
// detector (HMMRegime, M3) is run.
export function RegimeTimeline({
  series,
  regimeNames,
}: {
  series: RunSeries;
  regimeNames: string[];
}) {
  const colors = regimeColorMap(regimeNames);
  const hasPred = series.regimePred.some((p) => p != null);

  const band = (vals: (string | null)[]) => (
    <div className="regime-band">
      {vals.map((v, i) => (
        <div
          key={i}
          className="seg"
          style={{ flex: 1, background: v ? colors[v] ?? "#30363d" : "#161b22" }}
          title={`step ${i}: ${v ?? "—"}`}
        />
      ))}
    </div>
  );

  return (
    <div>
      <div className="small muted" style={{ marginBottom: 4 }}>ground truth</div>
      {band(series.regimeTruth)}
      <div className="small muted" style={{ margin: "10px 0 4px" }}>
        model prediction {hasPred ? "" : "— no regime model in this run"}
      </div>
      {hasPred ? (
        band(series.regimePred)
      ) : (
        <div className="regime-band" style={{ opacity: 0.3 }}>
          <div className="seg" style={{ flex: 1, background: "#161b22" }} />
        </div>
      )}
      <div className="legend">
        {regimeNames.map((n) => (
          <span className="item" key={n}>
            <span className="swatch" style={{ background: colors[n] }} />
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
