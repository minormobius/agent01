import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import type { ReliabilityBin } from "../../harness/types";

// Reliability diagram: predicted prob (x) vs observed frequency (y). The 45°
// line is perfect calibration. Model and the raw PM baseline are overlaid so
// "the baseline to beat" is literally on the same axes.
export function ReliabilityChart({
  model,
  pm,
}: {
  model: ReliabilityBin[];
  pm: ReliabilityBin[];
}) {
  const m = model.map((b) => ({ x: b.pMean, y: b.oMean, n: b.count }));
  const p = pm.map((b) => ({ x: b.pMean, y: b.oMean, n: b.count }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 14, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="#222b36" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" domain={[0, 1]} stroke="#8b949e" fontSize={11} name="predicted" tickMargin={6} />
          <YAxis type="number" dataKey="y" domain={[0, 1]} stroke="#8b949e" fontSize={11} width={40} name="observed" />
          <ZAxis type="number" dataKey="n" range={[30, 240]} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#5a6573" strokeDasharray="5 5" />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #2a3340", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, n) => [typeof v === "number" ? v.toFixed(3) : v, n === "x" ? "predicted" : n === "y" ? "observed" : n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Scatter name="model" data={m} fill="#58a6ff" />
          <Scatter name="raw PM" data={p} fill="#d2a8ff" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
