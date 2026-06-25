import { useMemo, useState, useRef } from "react";

// Dual-purpose chart: marginal bracket line (primary, left Y axis as %)
// plus ord income shaded area (right Y axis as $) — overlays scenario A
// and (optionally) scenario B for comparison.
//
// Marks: retire age, RMD 73, SS claim ages.

const BRACKET_COLOR_A = "var(--c-roth)";
const BRACKET_COLOR_B = "var(--c-equity)";
const INCOME_COLOR = "var(--c-taxable)";

export default function TimelineChart({ scenarioA, scenarioB, markers, lowBracketBand }) {
  const W = 880, H = 320;
  const padL = 56, padR = 56, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const geom = useMemo(() => {
    if (!scenarioA?.length) return null;
    const allRows = [...scenarioA, ...(scenarioB || [])];
    const maxBracket = Math.max(0.37, ...allRows.map((r) => r.marginalBracket));
    const maxIncome = Math.max(1, ...allRows.map((r) => r.ordIncome));
    const ageMin = scenarioA[0].age;
    const ageMax = scenarioA[scenarioA.length - 1].age;
    const ageSpan = Math.max(1, ageMax - ageMin);

    const x = (age) => padL + (innerW * (age - ageMin)) / ageSpan;
    const yL = (v) => padT + innerH - (innerH * Math.min(maxBracket, Math.max(0, v))) / maxBracket;
    const yR = (v) => padT + innerH - (innerH * Math.min(maxIncome, Math.max(0, v))) / maxIncome;

    const linePath = (rows, key, yFn) => {
      let d = "";
      for (let i = 0; i < rows.length; i++) {
        const cmd = i === 0 ? "M" : "L";
        d += `${cmd} ${x(rows[i].age)} ${yFn(rows[i][key])} `;
      }
      return d;
    };
    const areaPath = (rows, key, yFn) => {
      if (rows.length === 0) return "";
      let d = `M ${x(rows[0].age)} ${yFn(0)} `;
      for (let i = 0; i < rows.length; i++) d += `L ${x(rows[i].age)} ${yFn(rows[i][key])} `;
      d += `L ${x(rows[rows.length - 1].age)} ${yFn(0)} Z`;
      return d;
    };

    return {
      x, yL, yR, ageMin, ageMax, maxBracket, maxIncome,
      areaA: areaPath(scenarioA, "ordIncome", yR),
      bracketA: linePath(scenarioA, "marginalBracket", yL),
      bracketB: scenarioB ? linePath(scenarioB, "marginalBracket", yL) : null,
    };
  }, [scenarioA, scenarioB, innerW, innerH, padL, padR, padT]);

  if (!geom) return null;

  const yTicksLeft = [0, 0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  const yTicksRight = [0, 0.25, 0.5, 0.75, 1.0].map((f) => f * geom.maxIncome);
  const ageTicks = [];
  for (let a = Math.ceil(geom.ageMin / 5) * 5; a <= geom.ageMax; a += 5) {
    ageTicks.push(a);
  }

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (W / rect.width);
    const ageRel = ((sx - padL) / innerW) * (geom.ageMax - geom.ageMin);
    const age = Math.round(geom.ageMin + ageRel);
    const rowA = scenarioA.find((r) => r.age === age);
    const rowB = scenarioB?.find((r) => r.age === age);
    if (!rowA) return;
    setHover({
      left: (geom.x(age) / W) * rect.width,
      top: (geom.yL(rowA.marginalBracket) / H) * rect.height - 12,
      age, rowA, rowB,
    });
  };

  return (
    <div className="chart-wrap">
      <div className="legend">
        <span><span className="swatch" style={{ background: INCOME_COLOR, opacity: 0.35 }} />ord income ($)</span>
        <span><span className="swatch" style={{ background: BRACKET_COLOR_A }} />marginal bracket · A</span>
        {scenarioB && <span><span className="swatch" style={{ background: BRACKET_COLOR_B }} />marginal bracket · B</span>}
      </div>
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: "320px" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines and left axis labels at standard bracket boundaries */}
        {yTicksLeft.map((t, i) => (
          <g key={`yl${i}`}>
            <line x1={padL} y1={geom.yL(t)} x2={W - padR} y2={geom.yL(t)} stroke="currentColor" opacity="0.08" />
            <text x={padL - 6} y={geom.yL(t) + 3} fontFamily="var(--mono)" fontSize="9" textAnchor="end" fill={BRACKET_COLOR_A} opacity="0.7">{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        {/* right axis: ord income */}
        {yTicksRight.map((t, i) => (
          <text key={`yr${i}`} x={W - padR + 6} y={geom.yR(t) + 3} fontFamily="var(--mono)" fontSize="9" fill={INCOME_COLOR} opacity="0.7">
            {fmtAxis(t)}
          </text>
        ))}

        {/* Low-bracket band (highlight) */}
        {lowBracketBand && lowBracketBand.fromAge && (
          <rect
            x={geom.x(lowBracketBand.fromAge)}
            y={padT}
            width={geom.x(lowBracketBand.toAge) - geom.x(lowBracketBand.fromAge)}
            height={innerH}
            fill="var(--green)"
            opacity="0.08"
          />
        )}

        {/* Ord income area (right axis) */}
        <path d={geom.areaA} fill={INCOME_COLOR} opacity="0.18" />

        {/* Bracket lines */}
        <path d={geom.bracketA} stroke={BRACKET_COLOR_A} strokeWidth="2" fill="none" />
        {geom.bracketB && (
          <path d={geom.bracketB} stroke={BRACKET_COLOR_B} strokeWidth="2" fill="none" strokeDasharray="6 4" />
        )}

        {/* Markers */}
        {markers && markers.map((m, i) => (
          <g key={`mk${i}`}>
            <line x1={geom.x(m.age)} y1={padT} x2={geom.x(m.age)} y2={padT + innerH}
              stroke="currentColor" strokeDasharray={m.dashed ? "4 4" : ""} opacity={m.dashed ? 0.4 : 0.5} />
            <text x={geom.x(m.age) + 4} y={padT + 10 + i * 12} fontFamily="var(--mono)" fontSize="9"
              fill="currentColor" opacity="0.7">{m.label}</text>
          </g>
        ))}

        {/* Age axis */}
        {ageTicks.map((a, i) => (
          <g key={`at${i}`}>
            <line x1={geom.x(a)} y1={padT + innerH} x2={geom.x(a)} y2={padT + innerH + 4} stroke="currentColor" opacity="0.4" />
            <text x={geom.x(a)} y={padT + innerH + 16} fontFamily="var(--mono)" fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.6">{a}</text>
          </g>
        ))}
      </svg>

      {hover && (
        <div
          className="tip"
          style={{ opacity: 1, left: hover.left + "px", top: hover.top + "px", whiteSpace: "pre" }}
        >
          {`age ${hover.age}\n`}
          {`A · ${(hover.rowA.marginalBracket * 100).toFixed(0)}% · ord ${fmtAxis(hover.rowA.ordIncome)}`}
          {hover.rowB && `\nB · ${(hover.rowB.marginalBracket * 100).toFixed(0)}% · ord ${fmtAxis(hover.rowB.ordIncome)}`}
        </div>
      )}
    </div>
  );
}

function fmtAxis(v) {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + Math.round(v / 1e3) + "k";
  return "$" + Math.round(v);
}
