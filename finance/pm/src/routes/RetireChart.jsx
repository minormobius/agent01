import { useMemo, useState, useRef } from "react";

// Stacked-area projection chart. Layers (bottom -> top):
//   cash, taxable, traditional, hsa, roth — matches the networth palette.
// Optional vertical markers for retire age, RMD start, and depletion age.

const LAYER_ORDER = [
  { key: "cash", label: "Cash", color: "var(--c-cash)" },
  { key: "taxable", label: "Taxable", color: "var(--c-taxable)" },
  { key: "traditional", label: "Tax-deferred", color: "var(--c-traditional)" },
  { key: "hsa", label: "HSA", color: "var(--c-hsa)" },
  { key: "roth", label: "Roth", color: "var(--c-roth)" },
];

export default function RetireChart({ rows, retireAge, depletedAtAge }) {
  const W = 800, H = 320;
  const padL = 60, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = rows.length;

  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const geom = useMemo(() => {
    if (n === 0) return null;
    // Per row: cumulative top of each layer
    const stacks = rows.map((r) => {
      let cum = 0;
      const layers = {};
      for (const L of LAYER_ORDER) {
        cum += Math.max(0, r.balances[L.key] || 0);
        layers[L.key] = cum;
      }
      return { age: r.age, total: cum, layers };
    });
    const maxY = Math.max(1, ...stacks.map((s) => s.total));
    const ageMin = stacks[0].age;
    const ageMax = stacks[stacks.length - 1].age;
    const ageSpan = Math.max(1, ageMax - ageMin);

    const x = (age) => padL + (innerW * (age - ageMin)) / ageSpan;
    const y = (v) => padT + innerH - (innerH * v) / maxY;

    // Build a polygon for each layer
    const layerPaths = [];
    let prevTop = stacks.map(() => 0); // bottom of first layer is 0
    for (const L of LAYER_ORDER) {
      const top = stacks.map((s) => s.layers[L.key]);
      // Forward over top, back over previous top
      let d = `M ${x(stacks[0].age)} ${y(top[0])}`;
      for (let i = 1; i < n; i++) d += ` L ${x(stacks[i].age)} ${y(top[i])}`;
      for (let i = n - 1; i >= 0; i--) d += ` L ${x(stacks[i].age)} ${y(prevTop[i])}`;
      d += " Z";
      layerPaths.push({ key: L.key, label: L.label, color: L.color, d });
      prevTop = top;
    }

    // Total line (top of stack) — emphasized
    let totalLine = `M ${x(stacks[0].age)} ${y(stacks[0].total)}`;
    for (let i = 1; i < n; i++) totalLine += ` L ${x(stacks[i].age)} ${y(stacks[i].total)}`;

    // Y-axis labels at quartiles
    const yLabels = [];
    for (let f = 0; f <= 1; f += 0.25) {
      const v = maxY * f;
      yLabels.push({ y: y(v), label: fmtAxisMoney(v) });
    }

    // Age ticks every 5 years
    const ageTicks = [];
    const startTick = Math.ceil(ageMin / 5) * 5;
    for (let a = startTick; a <= ageMax; a += 5) {
      ageTicks.push({ x: x(a), label: a });
    }

    return { stacks, maxY, x, y, ageMin, ageMax, layerPaths, totalLine, yLabels, ageTicks };
  }, [rows, n, innerW, innerH, padL, padT]);

  if (!geom) return null;

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (W / rect.width);
    const ageRel = ((sx - padL) / innerW) * (geom.ageMax - geom.ageMin);
    const age = Math.round(geom.ageMin + ageRel);
    const row = rows.find((r) => r.age === age);
    if (!row) return;
    const stack = geom.stacks.find((s) => s.age === age);
    setHover({
      left: (geom.x(age) / W) * rect.width,
      top: (geom.y(stack.total) / H) * rect.height - 12,
      age,
      total: stack.total,
      row,
    });
  };

  return (
    <div className="chart-wrap">
      <div className="legend">
        {LAYER_ORDER.map((L) => (
          <span key={L.key}>
            <span className="swatch" style={{ background: L.color }} />
            {L.label}
          </span>
        ))}
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
        {geom.yLabels.map((l, i) => (
          <g key={`yl${i}`}>
            <text x={padL - 6} y={l.y + 3} fontFamily="var(--mono)" fontSize="9" textAnchor="end" fill="currentColor" opacity="0.6">{l.label}</text>
            <line x1={padL} y1={l.y} x2={W - padR} y2={l.y} stroke="currentColor" opacity="0.08" />
          </g>
        ))}

        {geom.layerPaths.map((p) => (
          <path key={p.key} d={p.d} fill={p.color} opacity="0.85" />
        ))}

        {/* Retire age vertical marker */}
        {retireAge >= geom.ageMin && retireAge <= geom.ageMax && (
          <g>
            <line x1={geom.x(retireAge)} y1={padT} x2={geom.x(retireAge)} y2={padT + innerH}
              stroke="currentColor" strokeDasharray="4 4" opacity="0.5" />
            <text x={geom.x(retireAge) + 4} y={padT + 10} fontFamily="var(--mono)" fontSize="9"
              fill="currentColor" opacity="0.7">retire {retireAge}</text>
          </g>
        )}

        {/* RMD start at 73 */}
        {73 >= geom.ageMin && 73 <= geom.ageMax && (
          <g>
            <line x1={geom.x(73)} y1={padT} x2={geom.x(73)} y2={padT + innerH}
              stroke="currentColor" strokeDasharray="2 4" opacity="0.35" />
            <text x={geom.x(73) + 4} y={padT + 22} fontFamily="var(--mono)" fontSize="9"
              fill="currentColor" opacity="0.5">RMD 73</text>
          </g>
        )}

        {/* Depletion */}
        {depletedAtAge && (
          <g>
            <line x1={geom.x(depletedAtAge)} y1={padT} x2={geom.x(depletedAtAge)} y2={padT + innerH}
              stroke="var(--red)" strokeWidth="1.5" opacity="0.7" />
            <text x={geom.x(depletedAtAge) - 4} y={padT + 10} fontFamily="var(--mono)" fontSize="9"
              fill="var(--red)" textAnchor="end">depletes {depletedAtAge}</text>
          </g>
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
          {`age ${hover.age} · $${Math.round(hover.total).toLocaleString()}\n`}
          {LAYER_ORDER
            .filter((L) => (hover.row.balances[L.key] || 0) > 0)
            .map((L) => `${L.label[0]}:${fmtAxisMoney(hover.row.balances[L.key])}`)
            .join("  ")}
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
