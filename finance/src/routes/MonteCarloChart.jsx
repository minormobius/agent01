import { useMemo, useState, useRef } from "react";

// Percentile-fan chart for Monte Carlo projection.
// Shaded bands: p10-p90 (light) and p25-p75 (darker), p50 as the median line.
// Same age axis as the bucket chart; vertical markers for retire age,
// RMD start, and median depletion age (if any).

export default function MonteCarloChart({ bands, retireAge, medianDepleteAge, successRate }) {
  const W = 800, H = 280;
  const padL = 60, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = bands.length;

  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const geom = useMemo(() => {
    if (n === 0) return null;
    const maxY = Math.max(1, ...bands.map((b) => b.p90));
    const ageMin = bands[0].age;
    const ageMax = bands[n - 1].age;
    const ageSpan = Math.max(1, ageMax - ageMin);

    const x = (age) => padL + (innerW * (age - ageMin)) / ageSpan;
    const y = (v) => padT + innerH - (innerH * Math.max(0, v)) / maxY;

    const fanPath = (loKey, hiKey) => {
      let d = `M ${x(bands[0].age)} ${y(bands[0][hiKey])}`;
      for (let i = 1; i < n; i++) d += ` L ${x(bands[i].age)} ${y(bands[i][hiKey])}`;
      for (let i = n - 1; i >= 0; i--) d += ` L ${x(bands[i].age)} ${y(bands[i][loKey])}`;
      d += " Z";
      return d;
    };
    const outerFan = fanPath("p10", "p90");
    const innerFan = fanPath("p25", "p75");
    let medianLine = `M ${x(bands[0].age)} ${y(bands[0].p50)}`;
    for (let i = 1; i < n; i++) medianLine += ` L ${x(bands[i].age)} ${y(bands[i].p50)}`;

    const yLabels = [];
    for (let f = 0; f <= 1; f += 0.25) {
      const v = maxY * f;
      yLabels.push({ y: y(v), label: fmtAxisMoney(v) });
    }
    const ageTicks = [];
    const startTick = Math.ceil(ageMin / 5) * 5;
    for (let a = startTick; a <= ageMax; a += 5) {
      ageTicks.push({ x: x(a), label: a });
    }
    return { ageMin, ageMax, maxY, x, y, outerFan, innerFan, medianLine, yLabels, ageTicks };
  }, [bands, n, innerW, innerH]);

  if (!geom) return null;

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (W / rect.width);
    const ageRel = ((sx - padL) / innerW) * (geom.ageMax - geom.ageMin);
    const age = Math.round(geom.ageMin + ageRel);
    const b = bands.find((x) => x.age === age);
    if (!b) return;
    setHover({
      left: (geom.x(age) / W) * rect.width,
      top: (geom.y(b.p90) / H) * rect.height - 12,
      age, b,
    });
  };

  return (
    <div className="chart-wrap">
      <div className="legend">
        <span><span className="swatch" style={{ background: "var(--c-taxable)", opacity: 0.25 }} />p10–p90</span>
        <span><span className="swatch" style={{ background: "var(--c-taxable)", opacity: 0.55 }} />p25–p75</span>
        <span><span className="swatch" style={{ background: "var(--c-taxable)" }} />median (p50)</span>
        {medianDepleteAge && (
          <span><span className="swatch" style={{ background: "var(--red)" }} />median depletion · age {medianDepleteAge}</span>
        )}
      </div>
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: "280px" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {geom.yLabels.map((l, i) => (
          <g key={`yl${i}`}>
            <text x={padL - 6} y={l.y + 3} fontFamily="var(--mono)" fontSize="9" textAnchor="end" fill="currentColor" opacity="0.6">{l.label}</text>
            <line x1={padL} y1={l.y} x2={W - padR} y2={l.y} stroke="currentColor" opacity="0.08" />
          </g>
        ))}

        <path d={geom.outerFan} fill="var(--c-taxable)" opacity="0.18" />
        <path d={geom.innerFan} fill="var(--c-taxable)" opacity="0.35" />
        <path d={geom.medianLine} stroke="var(--c-taxable)" strokeWidth="1.8" fill="none" />

        {retireAge >= geom.ageMin && retireAge <= geom.ageMax && (
          <g>
            <line x1={geom.x(retireAge)} y1={padT} x2={geom.x(retireAge)} y2={padT + innerH}
              stroke="currentColor" strokeDasharray="4 4" opacity="0.5" />
            <text x={geom.x(retireAge) + 4} y={padT + 10} fontFamily="var(--mono)" fontSize="9"
              fill="currentColor" opacity="0.7">retire {retireAge}</text>
          </g>
        )}
        {73 >= geom.ageMin && 73 <= geom.ageMax && (
          <line x1={geom.x(73)} y1={padT} x2={geom.x(73)} y2={padT + innerH}
            stroke="currentColor" strokeDasharray="2 4" opacity="0.35" />
        )}
        {medianDepleteAge && medianDepleteAge >= geom.ageMin && medianDepleteAge <= geom.ageMax && (
          <line x1={geom.x(medianDepleteAge)} y1={padT} x2={geom.x(medianDepleteAge)} y2={padT + innerH}
            stroke="var(--red)" strokeWidth="1.5" opacity="0.6" />
        )}

        {geom.ageTicks.map((t, i) => (
          <g key={`at${i}`}>
            <line x1={t.x} y1={padT + innerH} x2={t.x} y2={padT + innerH + 4} stroke="currentColor" opacity="0.4" />
            <text x={t.x} y={padT + innerH + 16} fontFamily="var(--mono)" fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.6">{t.label}</text>
          </g>
        ))}
      </svg>

      {hover && (
        <div
          className="tip"
          style={{ opacity: 1, left: hover.left + "px", top: hover.top + "px", whiteSpace: "pre" }}
        >
          {`age ${hover.age}\n`}
          {`p90 ${fmtAxisMoney(hover.b.p90)}\n`}
          {`p75 ${fmtAxisMoney(hover.b.p75)}\n`}
          {`p50 ${fmtAxisMoney(hover.b.p50)}\n`}
          {`p25 ${fmtAxisMoney(hover.b.p25)}\n`}
          {`p10 ${fmtAxisMoney(hover.b.p10)}`}
        </div>
      )}
    </div>
  );
}

function fmtAxisMoney(v) {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return "$" + Math.round(v / 1e3) + "k";
  return "$" + Math.round(v);
}
