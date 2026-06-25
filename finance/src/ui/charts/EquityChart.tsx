import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RunSeries } from "../../harness/types";

// Cumulative P&L (signed position applied to realized next-step returns).
export function EquityChart({ series }: { series: RunSeries }) {
  const data = series.equity.map((e, i) => ({ i, equity: e, pos: series.position[i] }));
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3fb950" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3fb950" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#222b36" strokeDasharray="3 3" />
          <XAxis dataKey="i" stroke="#8b949e" fontSize={11} tickMargin={6} />
          <YAxis stroke="#8b949e" fontSize={11} width={52} />
          <ReferenceLine y={0} stroke="#2a3340" />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #2a3340", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => (typeof v === "number" ? v.toFixed(4) : v)}
          />
          <Area type="monotone" dataKey="equity" stroke="#3fb950" fill="url(#eq)" strokeWidth={1.6} name="cum P&L" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
