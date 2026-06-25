import { useMemo, useRef, useState } from "react";

// Stacked principal/interest area + balance line over the loan term.
// 360 path points is small enough that React handles re-render fine —
// memoized so it only recomputes when rows actually change.
export default function MortChart({ rows, loan, term }) {
  const W = 800, H = 280;
  const padL = 50, padR = 10, padT = 10, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = rows.length;

  const [tip, setTip] = useState(null); // { x, y, label }
  const wrapRef = useRef(null);
  const svgRef = useRef(null);

  const geometry = useMemo(() => {
    if (n === 0) return null;
    const maxStack = Math.max(...rows.map((r) => r.principal + r.interest));
    const maxBalance = loan;

    const x = (i) => padL + (innerW * i) / (n - 1);
    const yL = (v) => padT + innerH - (innerH * v) / (maxStack || 1);
    const yR = (v) => padT + innerH - (innerH * v) / (maxBalance || 1);

    let pPath = `M ${x(0)} ${yL(0)}`;
    for (let i = 0; i < n; i++) pPath += ` L ${x(i)} ${yL(rows[i].principal)}`;
    pPath += ` L ${x(n - 1)} ${yL(0)} Z`;

    let iPath = `M ${x(0)} ${yL(rows[0].principal)}`;
    for (let i = 0; i < n; i++) iPath += ` L ${x(i)} ${yL(rows[i].principal + rows[i].interest)}`;
    for (let i = n - 1; i >= 0; i--) iPath += ` L ${x(i)} ${yL(rows[i].principal)}`;
    iPath += " Z";

    let bPath = `M ${x(0)} ${yR(loan)}`;
    for (let i = 0; i < n; i++) bPath += ` L ${x(i)} ${yR(rows[i].balance)}`;

    const yearTicks = [];
    for (let y = 0; y <= term; y += 5) {
      const i = Math.min(n - 1, y * 12);
      yearTicks.push({ x: x(i), label: `${y}y` });
    }

    const yLabels = [];
    for (let f = 0; f <= 1; f += 0.25) {
      const v = maxStack * f;
      yLabels.push({ y: yL(v), label: "$" + Math.round(v).toLocaleString() });
    }

    return { x, yL, yR, pPath, iPath, bPath, yearTicks, yLabels, maxStack };
  }, [rows, loan, term, n, innerW, innerH, padL, padT, padR, padB]);

  if (!geometry) return null;

  const fmtMoney = (v) => "$" + Math.round(v).toLocaleString();

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (W / rect.width);
    const i = Math.max(0, Math.min(n - 1, Math.round(((sx - padL) / innerW) * (n - 1))));
    const row = rows[i];
    setTip({
      left: (geometry.x(i) / W) * rect.width,
      top: (geometry.yL(row.principal + row.interest) / H) * rect.height - 8,
      label: `mo ${row.m} · bal ${fmtMoney(row.balance)}\nP ${fmtMoney(row.principal)} · I ${fmtMoney(row.interest)}`,
    });
  };

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="legend">
        <span><span className="swatch" style={{ background: "var(--principal)" }} />principal</span>
        <span><span className="swatch" style={{ background: "var(--interest)" }} />interest</span>
        <span><span className="swatch" style={{ background: "var(--balance)", height: "2px", marginTop: "0.35rem" }} />balance remaining</span>
      </div>
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
      >
        {geometry.yLabels.map((l, i) => (
          <g key={`yl${i}`}>
            <text x={padL - 6} y={l.y + 3} fontFamily="var(--mono)" fontSize="9" textAnchor="end" fill="currentColor" opacity="0.6">{l.label}</text>
            <line x1={padL} y1={l.y} x2={W - padR} y2={l.y} stroke="currentColor" opacity="0.08" />
          </g>
        ))}
        <path d={geometry.pPath} fill="var(--principal)" opacity="0.65" />
        <path d={geometry.iPath} fill="var(--interest)" opacity="0.55" />
        <path d={geometry.bPath} stroke="var(--balance)" strokeWidth="1.5" fill="none" />
        {geometry.yearTicks.map((t, i) => (
          <g key={`tk${i}`}>
            <line x1={t.x} y1={padT + innerH} x2={t.x} y2={padT + innerH + 4} stroke="currentColor" opacity="0.4" />
            <text x={t.x} y={padT + innerH + 16} fontFamily="var(--mono)" fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.6">{t.label}</text>
          </g>
        ))}
      </svg>
      {tip && (
        <div
          className="tip"
          style={{ opacity: 1, left: tip.left + "px", top: tip.top + "px", whiteSpace: "pre" }}
        >
          {tip.label}
        </div>
      )}
    </div>
  );
}
