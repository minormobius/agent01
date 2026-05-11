import { useMemo } from "react";
import SiteHeader from "../components/SiteHeader";
import Link from "../components/Link";
import { useProfile } from "../state/profile";
import { STATES } from "../lib/states";
import { annualCashflow } from "../lib/cashflow";

function fmtMoney(v, decimals = 0) {
  if (!isFinite(v)) return "—";
  return "$" + v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(v, decimals = 1) {
  return (v * 100).toFixed(decimals) + "%";
}

export default function Cashflow() {
  const { profile, update } = useProfile();
  const h = profile.household;
  const inc = profile.income;

  // ─── Setters ────────────────────────────────────────────────────────
  const setHH = (patch) =>
    update((p) => ({ ...p, household: { ...p.household, ...patch } }));
  const setIncome = (patch) =>
    update((p) => ({ ...p, income: { ...p.income, ...patch } }));
  const setPretax = (patch) =>
    update((p) => ({ ...p, income: { ...p.income, pretax: { ...p.income.pretax, ...patch } } }));
  const setPost = (patch) =>
    update((p) => ({ ...p, income: { ...p.income, postTaxSavings: { ...p.income.postTaxSavings, ...patch } } }));

  const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v) || 0);

  // ─── Engine call ────────────────────────────────────────────────────
  const cf = useMemo(() => annualCashflow({
    salary: num(inc.salary),
    bonus: num(inc.bonus),
    rsuValue: num(inc.rsuValue),
    otherIncome: num(inc.otherIncome),
    pretaxK401: num(inc.pretax?.k401),
    pretaxHSA: num(inc.pretax?.hsa),
    pretaxHealth: num(inc.pretax?.health),
    pretaxOther: num(inc.pretax?.other),
    postTaxRoth: num(inc.postTaxSavings?.roth),
    postTaxBrokerage: num(inc.postTaxSavings?.brokerage),
    postTaxOther: num(inc.postTaxSavings?.other),
    filing: h.filing,
    stateFips: h.stateFips,
    stateTaxOverride: inc.stateIncTaxAuto === false ? num(inc.stateIncTax) : null,
  }), [inc, h.filing, h.stateFips]);

  const hasIncome = cf.grossWages + cf.otherIncome > 0;

  // Monthly fixed/variable expenses live on profile.expenses
  const ex = profile.expenses || {};
  const fixedMo = num(ex.fixedMonthly);
  const varMo = num(ex.variableMonthly);
  const expensesAnnual = (fixedMo + varMo) * 12;
  const surplusAnnual = cf.afterSavings - expensesAnnual;
  const surplusMo = surplusAnnual / 12;

  return (
    <div className="page">
      <SiteHeader section="cashflow" />
      <p className="subtitle">annual cash flow</p>
      <p className="desc">
        gross income → pre-tax deferrals → federal + FICA + state tax → take-home → post-tax
        savings → surplus. inputs persist to your profile so <Link to="/retire">/retire</Link>
        {" "}sees the same numbers.
      </p>

      <h2 className="section">income</h2>
      <div className="grid">
        <Field label="W-2 salary ($/yr)">
          <input type="number" inputMode="decimal" min="0" step="1000"
            value={inc.salary ?? ""}
            onChange={(e) => setIncome({ salary: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="bonus ($/yr)" note="annual cash bonus, gross">
          <input type="number" inputMode="decimal" min="0" step="500"
            value={inc.bonus ?? ""}
            onChange={(e) => setIncome({ bonus: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="RSU vest value ($/yr)" note="annualized $ of shares vesting; counts as W-2">
          <input type="number" inputMode="decimal" min="0" step="1000"
            value={inc.rsuValue ?? ""}
            onChange={(e) => setIncome({ rsuValue: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="other income ($/yr)" note="1099, K-1, interest, dividends">
          <input type="number" inputMode="decimal" min="0" step="500"
            value={inc.otherIncome ?? ""}
            onChange={(e) => setIncome({ otherIncome: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
      </div>

      <h2 className="section">pre-tax deferrals</h2>
      <div className="grid">
        <Field label="401k / 403b ($/yr)" note="traditional contribution; 2025 limit $23,500 ($31k 50+)">
          <input type="number" inputMode="decimal" min="0" step="500"
            value={inc.pretax?.k401 ?? ""}
            onChange={(e) => setPretax({ k401: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="HSA ($/yr)" note="employee + employer combined; 2025 family limit $8,550">
          <input type="number" inputMode="decimal" min="0" step="100"
            value={inc.pretax?.hsa ?? ""}
            onChange={(e) => setPretax({ hsa: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="pre-tax health premium ($/yr)" note="your share, employer plan">
          <input type="number" inputMode="decimal" min="0" step="100"
            value={inc.pretax?.health ?? ""}
            onChange={(e) => setPretax({ health: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="other pre-tax ($/yr)" note="FSA, dependent care, transit, parking">
          <input type="number" inputMode="decimal" min="0" step="100"
            value={inc.pretax?.other ?? ""}
            onChange={(e) => setPretax({ other: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
      </div>

      <h2 className="section">filing · state · age</h2>
      <p className="desc" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        These persist across every tool — change them here or on <Link to="/mort">/mort</Link> and
        they'll match. State tax is auto-estimated as a flat effective rate × AGI from the state
        table; override with your actual figure if you have it.
      </p>
      <div className="grid">
        <Field label="filing status">
          <select value={h.filing} onChange={(e) => setHH({ filing: e.target.value })}>
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
            <option value="hoh">Head of household</option>
            <option value="mfs">Married filing separately</option>
          </select>
        </Field>
        <Field label="state">
          <select value={h.stateFips || ""} onChange={(e) => setHH({ stateFips: e.target.value || null })}>
            <option value="">— select state —</option>
            {STATES.map(([abbr, fips, name]) => (
              <option key={fips} value={fips}>{name}</option>
            ))}
          </select>
        </Field>
        <Field label="current age" note="used by /retire to project forward">
          <input type="number" inputMode="numeric" min="18" max="100" step="1"
            value={h.currentAge ?? ""}
            onChange={(e) => setHH({ currentAge: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field
          label="state tax owed ($/yr, override)"
          note={inc.stateIncTaxAuto === false ? "manual override" : `auto: ${pct(cf.state / Math.max(1, cf.agi))} × AGI`}
        >
          <input
            type="number" inputMode="decimal" min="0" step="100"
            placeholder={`auto from state (${fmtMoney(cf.state)})`}
            value={inc.stateIncTaxAuto === false ? (inc.stateIncTax ?? "") : ""}
            onChange={(e) => setIncome({
              stateIncTax: e.target.value === "" ? null : Number(e.target.value),
              stateIncTaxAuto: false,
            })}
          />
        </Field>
        {inc.stateIncTaxAuto === false && (
          <div className="full">
            <button onClick={() => setIncome({ stateIncTax: null, stateIncTaxAuto: true })}>
              clear override · use auto-estimate
            </button>
          </div>
        )}
      </div>

      <h2 className="section">post-tax savings</h2>
      <div className="grid">
        <Field label="Roth (401k + IRA) ($/yr)" note="Roth IRA limit $7,000 (2025); Roth 401k shares 401k limit">
          <input type="number" inputMode="decimal" min="0" step="100"
            value={inc.postTaxSavings?.roth ?? ""}
            onChange={(e) => setPost({ roth: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="taxable brokerage ($/yr)">
          <input type="number" inputMode="decimal" min="0" step="500"
            value={inc.postTaxSavings?.brokerage ?? ""}
            onChange={(e) => setPost({ brokerage: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
        <Field label="other after-tax ($/yr)" note="529, after-tax 401k, taxable HSA share">
          <input type="number" inputMode="decimal" min="0" step="100"
            value={inc.postTaxSavings?.other ?? ""}
            onChange={(e) => setPost({ other: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </Field>
      </div>

      <h2 className="section">expenses</h2>
      <div className="grid">
        <Field label="fixed ($/mo)" note="rent/mortgage, insurance, utilities, childcare, debt">
          <input type="number" inputMode="decimal" min="0" step="50"
            value={ex.fixedMonthly ?? ""}
            onChange={(e) => update((p) => ({ ...p, expenses: { ...p.expenses, fixedMonthly: Number(e.target.value) || 0 } }))} />
        </Field>
        <Field label="variable ($/mo)" note="food, transit, entertainment, travel, everything else">
          <input type="number" inputMode="decimal" min="0" step="50"
            value={ex.variableMonthly ?? ""}
            onChange={(e) => update((p) => ({ ...p, expenses: { ...p.expenses, variableMonthly: Number(e.target.value) || 0 } }))} />
        </Field>
      </div>

      {/* ── Summary card ──────────────────────────────────────────── */}
      <div className="summary" style={{ marginTop: "2rem" }}>
        <div className="total">
          <span className="lbl">annual take-home</span>
          <span className="val">{fmtMoney(cf.takeHome)}</span>
        </div>
        {hasIncome && <FlowBar cf={cf} expensesAnnual={expensesAnnual} />}
        <div className="breakdown" style={{ marginTop: "1rem" }}>
          <Row k="Gross wages (W-2)" v={fmtMoney(cf.grossWages)} />
          <Row k="Other income" v={fmtMoney(cf.otherIncome)} />
          <Row k="− Pre-tax deferrals" v={fmtMoney(-cf.pretaxTotal)} />
          <Row k="= AGI" v={fmtMoney(cf.agi)} bold />
          <Row k="− Federal tax" v={fmtMoney(-cf.fed)} note={pct(cf.effFedRate) + " of AGI"} />
          <Row k="− FICA total" v={fmtMoney(-cf.ficaTotal)} note={`SS ${fmtMoney(cf.ficaSS)} + Med ${fmtMoney(cf.ficaMedicare)}` + (cf.ficaAddlMedicare > 0 ? ` + Addl ${fmtMoney(cf.ficaAddlMedicare)}` : "")} />
          <Row k="− State tax" v={fmtMoney(-cf.state)} />
          <Row k="= Take-home" v={fmtMoney(cf.takeHome)} bold />
          <Row k="− Post-tax savings" v={fmtMoney(-cf.postTaxSavings)} />
          <Row k="= After savings" v={fmtMoney(cf.afterSavings)} bold />
          <Row k="− Expenses" v={fmtMoney(-expensesAnnual)} />
          <Row k="= Surplus" v={fmtMoney(surplusAnnual)} bold neg={surplusAnnual < 0} />
        </div>
      </div>

      <div className="aggregates">
        <div className="a-row"><span className="k">Monthly gross</span><span className="v">{fmtMoney(cf.monthly.gross)}</span></div>
        <div className="a-row"><span className="k">Monthly take-home</span><span className="v">{fmtMoney(cf.monthly.takeHome)}</span></div>
        <div className="a-row"><span className="k">Monthly after savings</span><span className="v">{fmtMoney(cf.monthly.afterSavings)}</span></div>
        <div className="a-row"><span className="k">Monthly surplus</span><span className="v">{fmtMoney(surplusMo)}</span></div>
        <div className="a-row"><span className="k">Effective total tax rate</span><span className="v">{pct(cf.effTotalRate)}</span></div>
        <div className="a-row"><span className="k">Annual savings rate</span><span className="v">{pct(cf.totalSavings / Math.max(1, cf.grossWages + cf.otherIncome))}</span></div>
      </div>

      <div className="footer">
        <strong>What's modeled.</strong> 2025 federal brackets & standard deduction (post-OBBBA).
        FICA at 6.2% Social Security up to the $176,100 wage base, 1.45% Medicare uncapped, plus
        0.9% Additional Medicare above ${`200k single / 250k MFJ`}. State income tax as a flat
        effective rate × AGI from the state table — fine for planning, but state-by-state quirks
        (PA flat, NJ excluding 401k, MA short-term cap gains, etc.) are not captured. Override with
        your actual figure for accuracy.
        <br /><br />
        <strong>What's not.</strong> AMT, NIIT (3.8% on net investment income above $200k/$250k),
        QBI deduction for pass-throughs, itemizing (see <Link to="/mort">/mort</Link> for the
        itemized vs standard model). Employer 401k match isn't an income input here — it shows up
        in <Link to="/retire">/retire</Link> as a contribution to the traditional bucket.
      </div>
    </div>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────

function Field({ label, note, children }) {
  return (
    <div>
      <label>{label}</label>
      {children}
      {note !== undefined && <div className="note">{note}</div>}
    </div>
  );
}

function Row({ k, v, note, bold, neg }) {
  return (
    <div className="row" style={bold ? { fontWeight: 600 } : undefined}>
      <span className="k">{k}{note && <span style={{ color: "var(--rule)" }}> · {note}</span>}</span>
      <span className="v" style={neg ? { color: "var(--red)" } : undefined}>{v}</span>
    </div>
  );
}

function FlowBar({ cf, expensesAnnual }) {
  const total = cf.grossWages + cf.otherIncome;
  if (total <= 0) return null;
  const segs = [
    { label: "Tax", value: cf.totalTax, color: "var(--c-debt)" },
    { label: "Pre-tax savings", value: cf.pretaxK401 + cf.pretaxHSA + cf.pretaxOther + cf.pretaxHealth, color: "var(--c-traditional)" },
    { label: "Post-tax savings", value: cf.postTaxSavings, color: "var(--c-roth)" },
    { label: "Expenses", value: Math.min(expensesAnnual, Math.max(0, cf.afterSavings)), color: "var(--c-realestate)" },
    { label: "Surplus", value: Math.max(0, cf.afterSavings - expensesAnnual), color: "var(--c-taxable)" },
  ].filter((s) => s.value > 0);

  return (
    <>
      <div className="alloc-bar" style={{ marginTop: "0.5rem" }}>
        {segs.map((s, i) => (
          <div
            key={i}
            className="seg"
            style={{
              width: (s.value / total) * 100 + "%",
              background: s.color,
            }}
            title={`${s.label}: ${fmtMoney(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="alloc-legend">
        {segs.map((s, i) => (
          <span key={i}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
            <span className="pct">{((s.value / total) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </>
  );
}
