import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Dataset } from "../../data/dataset";

// Visualizes the core streams of a dataset: asset price (left axis), the PM
// implied probability and the model-free fundamental (right axis 0..1 for PM).
export function StreamChart({ dataset }: { dataset: Dataset }) {
  const truth = dataset.truth;
  const data = dataset.decisionTimes.map((dt, i) => ({
    i,
    t: dt.slice(0, 10),
    price: truth?.price[i],
    fundamental: truth?.fundamental[i],
    pm: truth?.pmImplied[i],
  }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#222b36" strokeDasharray="3 3" />
          <XAxis dataKey="i" stroke="#8b949e" fontSize={11} tickMargin={6} />
          <YAxis yAxisId="price" stroke="#58a6ff" fontSize={11} width={48} />
          <YAxis
            yAxisId="prob"
            orientation="right"
            domain={[0, 1]}
            stroke="#d2a8ff"
            fontSize={11}
            width={40}
          />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #2a3340", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(i) => `step ${i} · ${data[i as number]?.t ?? ""}`}
            formatter={(v: number, n) => [typeof v === "number" ? v.toFixed(n === "pm" ? 3 : 2) : v, n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="price" type="monotone" dataKey="price" stroke="#58a6ff" dot={false} strokeWidth={1.6} name="asset price" />
          <Line yAxisId="price" type="monotone" dataKey="fundamental" stroke="#8b949e" dot={false} strokeWidth={1} strokeDasharray="4 4" name="fundamental" />
          <Line yAxisId="prob" type="monotone" dataKey="pm" stroke="#d2a8ff" dot={false} strokeWidth={1.4} name="PM implied" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
