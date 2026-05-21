import SiteHeader from "../components/SiteHeader";
import Link from "../components/Link";

// Planning hub. Each tool gets a card; tools that don't exist yet are
// labeled 'soon' and show a thin description of what they'll do.
const TOOLS = [
  {
    to: "/networth",
    name: "Net worth",
    status: "live",
    desc: "Account-by-account balance sheet, grouped by tax treatment. Allocation across cash, taxable, tax-deferred, Roth, HSA, real estate, equity comp, debt.",
  },
  {
    to: "/mort",
    name: "Mortgage",
    status: "live",
    desc: "PITI + PMI amortization. Year-by-year federal tax benefit including OBBBA SALT cap, mortgage interest acquisition-debt cap, and standard-vs-itemized switching.",
  },
  {
    to: "/cashflow",
    name: "Cash flow",
    status: "live",
    desc: "Salary, RSU vesting, bonus → federal + state + FICA → fixed/variable expenses → savings buckets. Surplus or deficit at the bottom.",
  },
  {
    to: "/roth",
    name: "Roth vs traditional",
    status: "soon",
    desc: "Side-by-side comparison given your current marginal bracket and a projected retirement bracket. Includes Roth conversion ladder framing.",
  },
  {
    to: "/rentbuy",
    name: "Rent vs buy",
    status: "soon",
    desc: "Mortgage cost (after tax) plus opportunity cost of the down payment vs equivalent rent. Break-even horizon, sensitivity to appreciation and return assumptions.",
  },
  {
    to: "/retire",
    name: "Retirement projection",
    status: "live",
    desc: "Year-by-year tax-aware projection. Stacked-area chart by tax bucket, RMDs from 73, Roth conversion windows flagged. Monte Carlo coming in v2.",
  },
  {
    to: "/insurance",
    name: "Insurance audit",
    status: "soon",
    desc: "Coverage gap analysis — life, disability, umbrella — given net worth and dependents.",
  },
  {
    to: "/timeline",
    name: "Tax timeline",
    status: "live",
    desc: "Marginal federal bracket plotted year by year, working through retirement. Highlights low-bracket Roth-conversion windows. Two-scenario overlay (baseline vs alternate strategy) for A/B-ing SS claim ages and conversion ladders.",
  },
];

const EXTERNALS = [
  { to: "/stocks/", name: "stocks", desc: "Daily OHLCV archive on ATProto PDS, options pricer, vol surface. Lives at /stocks/." },
  { to: "/agimet/", name: "agimet", desc: "Labor market dashboard — unemployment by education + the college wage premium, straight from FRED. Lives at /agimet/." },
  { to: "/bogo/", name: "bogo", desc: "Live at /bogo/." },
];

export default function Landing() {
  return (
    <div className="page">
      <SiteHeader />
      <p className="subtitle">personal finance planning</p>
      <p className="desc">
        a constellation of small, sharp tools built on a shared tax engine.
        every page reads from one local profile, so adding an account on{" "}
        <Link to="/networth">/networth</Link> is the same account that{" "}
        <Link to="/mort">/mort</Link> and <em>/retire</em> see.
      </p>

      <h2 className="section">tools</h2>
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <ToolCard key={t.to} {...t} />
        ))}
      </div>

      <h2 className="section">also here</h2>
      <div className="tool-grid">
        {EXTERNALS.map((t) => (
          <ToolCard key={t.to} {...t} status="static" />
        ))}
      </div>

      <div className="footer">
        Built on a shared tax engine ({" "}
        <code>src/lib/tax.js</code>, <code>amortize.js</code>, <code>states.js</code>{" "}
        ) and a single local profile ({" "}
        <code>src/state/profile.js</code> — localStorage now, ATProto-encrypted PDS sync coming).
        Source: <a href="https://github.com/minormobius/agent01/tree/main/finance" target="_blank" rel="noreferrer">github.com/minormobius/agent01/tree/main/finance</a>.
      </div>
    </div>
  );
}

function ToolCard({ to, name, status, desc }) {
  const isLive = status === "live" || status === "static";
  const inner = (
    <div className={`tool-card${isLive ? "" : " soon"}`}>
      <div className="tool-card-hdr">
        <span className="tool-name">{name}</span>
        <span className={`tool-status tool-status-${status}`}>{status}</span>
      </div>
      <p className="tool-desc">{desc}</p>
    </div>
  );
  if (!isLive) return inner;
  return <Link to={to} className="tool-card-link">{inner}</Link>;
}
