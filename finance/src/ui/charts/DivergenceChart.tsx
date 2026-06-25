import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RunSeries } from "../../harness/types";

// PM-implied vs asset-implied probability of the linked event, with the spread
// (PM − asset) as bars. Where they diverge is where the cross-market model acts.
export function DivergenceChart({ series }: { series: RunSeries }) {
  const data = series.decisionTimes.map((_, i) => ({
    i,
    pm: series.pmProb[i],
    asset: series.assetImplied[i],
    spread: series.spread[i],
  }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#222b36" strokeDasharray="3 3" />
          <XAxis dataKey="i" stroke="#8b949e" fontSize={11} tickMargin={6} />
          <YAxis domain={[-0.5, 1]} stroke="#8b949e" fontSize={11} width={44} />
          <ReferenceLine y={0} stroke="#2a3340" />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #2a3340", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => (typeof v === "number" ? v.toFixed(3) : v)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="spread" fill="#d29922" name="spread (PM−asset)" opacity={0.55} />
          <Line type="monotone" dataKey="pm" stroke="#d2a8ff" dot={false} strokeWidth={1.4} name="PM implied" />
          <Line type="monotone" dataKey="asset" stroke="#58a6ff" dot={false} strokeWidth={1.4} name="asset implied" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
