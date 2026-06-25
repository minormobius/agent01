import { useState, useMemo } from "react";
import SiteHeader from "../components/SiteHeader";
import Link from "../components/Link";
import { useProfile } from "../state/profile";
import { projectPortfolio } from "../lib/projection";
import { federalTax, marginalRate, STD_DED_2025 } from "../lib/tax";
import { stateInfo } from "../lib/states";
import TimelineChart from "./TimelineChart";

function fmtMoney(v) {
  if (!isFinite(v) || v === 0) return "$0";
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + Math.round(v / 1e3) + "k";
  return "$" + Math.round(v).toLocaleString();
}
function pct(v, d = 1) {
  return (v * 100).toFixed(d) + "%";
}
function accountsToBalances(accounts) {
  const sum = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };
  for (const a of accounts || []) {
    if (sum[a.type] !== undefined) sum[a.type] += Number(a.balance) || 0;
  }
  return sum;
}

// Stitch a projection's rows into a unified timeline that includes working
// years with computed ord income (W2 minus pre-tax deferrals from profile.income).
// The engine returns 0 ord income for working years (it doesn't model salary);
// we synthesize it here so the chart shows your actual current bracket too.
function stitchTimeline(projRows, retireAge, profileIncome, filing) {
  const std = STD_DED_2025[filing] || STD_DED_2025.single;
  const salary = Number(profileIncome.salary) || 0;
  const bonus = Number(profileIncome.bonus) || 0;
  const rsu = Number(profileIncome.rsuValue) || 0;
  const other = Number(profileIncome.otherIncome) || 0;
  const pretax = (Number(profileIncome.pretax?.k401) || 0)
    + (Number(profileIncome.pretax?.hsa) || 0)
    + (Number(profileIncome.pretax?.health) || 0)
    + (Number(profileIncome.pretax?.other) || 0);
  const workingOrd = Math.max(0, salary + bonus + rsu + other - pretax);
  const workingMarg = marginalRate(Math.max(0, workingOrd - std), filing);
  const workingTax = federalTax(Math.max(0, workingOrd - std), filing);

  return projRows.map((r) => {
    if (!r.retired) {
      // Synthesize working-year ord income view. Engine's yearOrdIncome only
      // captures Roth conversions in working years; we ADD that to the W2
      // baseline so the chart reflects a conversion's marginal-bracket bump.
      const ord = workingOrd + (r.yearOrdIncome || 0);
      const marg = marginalRate(Math.max(0, ord - std), filing);
      return { age: r.age, year: r.year, ordIncome: ord, marginalBracket: marg, yearTax: workingTax + (r.yearTax || 0), retired: false };
    }
    return {
      age: r.age, year: r.year,
      ordIncome: r.yearOrdIncome || 0,
      marginalBracket: r.marginalBracket || 0,
      yearTax: r.yearTax || 0,
      retired: true,
      yearSS: r.yearSS, yearRMD: r.yearRMD, yearConversion: r.yearConversion,
    };
  });
}

export default function Timeline() {
  const { profile } = useProfile();
  const h = profile.household || {};
  const inc = profile.income || {};
  const ass = profile.assumptions || {};
  const ss = inc.socialSecurity || {};
  const rc = ass.rothConversion || {};

  const filing = h.filing || "single";
  const currentAge = h.currentAge || 35;
  const retireAge = ass.retireAge || 65;
  const endAge = ass.endAge || 95;

  // Scenario B is editable in this route. Defaults to a useful "what if" prompt:
  // claim SS at 70 instead of FRA, plus a moderate conversion ladder.
  const [scenarioB, setScenarioB] = useState({
    enabled: false,
    label: "alternate",
    ssClaim: 70,
    partnerSsClaim: 70,
    conversionEnabled: true,
    conversionFromAge: retireAge,
    conversionToAge: 72,
    conversionAmount: 50000,
  });

  const balances = useMemo(() => accountsToBalances(profile.accounts), [profile.accounts]);
  const annualContrib = useMemo(() => ({
    traditional: Number(inc.pretax?.k401 || 0),
    roth: Number(inc.postTaxSavings?.roth || 0),
    taxable: Number(inc.postTaxSavings?.brokerage || 0) + Number(inc.postTaxSavings?.other || 0),
    hsa: Number(inc.pretax?.hsa || 0),
    cash: 0,
  }), [inc]);
  const totalLiquid = Object.values(balances).reduce((s, v) => s + v, 0);

  // Build inputs for scenario A (baseline = profile's saved settings)
  const baseInputs = useMemo(() => ({
    currentAge, retireAge, endAge,
    balances,
    contributions: annualContrib,
    employerMatch: Number(ass.employerMatch) || 0,
    targetSpend: Number(ass.targetSpend) || 100000,
    realReturn: Number(ass.realReturn) || 0.05,
    filing,
    taxableBasisFrac: ass.taxableBasisFrac ?? 0.6,
    socialSecurity: {
      benefitAtFRA: Number(ss.benefitAtFRA) || 0,
      claimAge: Number(ss.claimAge) || 67,
      partnerBenefitAtFRA: filing === "mfj" ? (Number(ss.partnerBenefitAtFRA) || 0) : 0,
      partnerClaimAge: Number(ss.partnerClaimAge) || 67,
    },
  }), [currentAge, retireAge, endAge, balances, annualContrib, ass, filing, ss]);

  const projA = useMemo(() => {
    if (totalLiquid === 0) return null;
    return projectPortfolio({
      ...baseInputs,
      rothConversion: (rc.enabled && rc.annualAmount > 0)
        ? { fromAge: rc.fromAge || retireAge, toAge: rc.toAge || 72, annualAmount: Number(rc.annualAmount) }
        : null,
    });
  }, [baseInputs, rc, retireAge, totalLiquid]);

  const projB = useMemo(() => {
    if (totalLiquid === 0 || !scenarioB.enabled) return null;
    return projectPortfolio({
      ...baseInputs,
      socialSecurity: {
        ...baseInputs.socialSecurity,
        claimAge: scenarioB.ssClaim,
        partnerClaimAge: scenarioB.partnerSsClaim,
      },
      rothConversion: scenarioB.conversionEnabled ? {
        fromAge: scenarioB.conversionFromAge,
        toAge: scenarioB.conversionToAge,
        annualAmount: Number(scenarioB.conversionAmount) || 0,
      } : null,
    });
  }, [baseInputs, scenarioB, totalLiquid]);

  const stitchedA = useMemo(
    () => projA ? stitchTimeline(projA.rows, retireAge, inc, filing) : null,
    [projA, retireAge, inc, filing]
  );
  const stitchedB = useMemo(
    () => projB ? stitchTimeline(projB.rows, retireAge, inc, filing) : null,
    [projB, retireAge, inc, filing]
  );

  // Find the low-bracket window in scenario A (retirement years pre-RMD with
  // ord income below the 22% threshold for the user's filing). This is the
  // user-visible "Roth conversion sweet spot".
  const lowBracketBand = useMemo(() => {
    if (!stitchedA) return null;
    let from = null, to = null;
    for (const r of stitchedA) {
      if (r.retired && r.age < 73 && r.marginalBracket <= 0.12) {
        if (from === null) from = r.age;
        to = r.age;
      } else if (from !== null) {
        break;
      }
    }
    return from ? { fromAge: from, toAge: to } : null;
  }, [stitchedA]);

  const markers = useMemo(() => {
    const m = [{ age: retireAge, label: "retire", dashed: true }];
    if (73 >= currentAge && 73 <= endAge) m.push({ age: 73, label: "RMD 73", dashed: true });
    const sa = Number(ss.claimAge) || 67;
    if (sa >= currentAge && sa <= endAge) m.push({ age: sa, label: `SS A · ${sa}`, dashed: true });
    return m;
  }, [retireAge, currentAge, endAge, ss.claimAge]);

  const stats = useMemo(() => {
    const summarize = (proj, stitched) => {
      if (!proj || !stitched) return null;
      return {
        lifetimeTax: stitched.reduce((s, r) => s + (r.yearTax || 0), 0),
        endingTotal: proj.rows[proj.rows.length - 1].totalReal,
        endingRoth: proj.rows[proj.rows.length - 1].balances.roth,
        peakReal: proj.peakRealValue,
        depleted: proj.depletedAtAge,
      };
    };
    return { A: summarize(projA, stitchedA), B: summarize(projB, stitchedB) };
  }, [projA, projB, stitchedA, stitchedB]);

  return (
    <div className="page">
      <SiteHeader section="timeline" />
      <p className="subtitle">tax bracket timeline · scenario A vs B</p>
      <p className="desc">
        marginal federal bracket year by year, working years through retirement.
        flat low-bracket stretches in retirement are roth-conversion windows.
        compare scenarios — change SS claim age, conversion strategy, see the
        bracket lines move. reads all the inputs from your <Link to="/cashflow">/cashflow</Link>
        {" "}and <Link to="/retire">/retire</Link> profile.
      </p>

      {totalLiquid === 0 && (
        <div className="warn">
          <strong>no accounts yet.</strong> add accounts on <Link to="/networth">/networth</Link>
          {" "}and income on <Link to="/cashflow">/cashflow</Link> for the timeline to plot anything.
        </div>
      )}

      {/* Scenario B controls */}
      <h2 className="section">scenario B · alternate strategy</h2>
      <p className="desc" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        scenario A is your saved baseline (whatever's currently in /retire). B overlays
        an alternate strategy without modifying your saved profile. defaults to "claim
        SS at 70 + run a moderate conversion ladder" — flip on and edit to taste.
      </p>
      <div className="grid">
        <Field label="overlay scenario B?">
          <select value={scenarioB.enabled ? "on" : "off"} onChange={(e) => setScenarioB((s) => ({ ...s, enabled: e.target.value === "on" }))}>
            <option value="off">off (A only)</option>
            <option value="on">on (overlay)</option>
          </select>
        </Field>
        <Field label="B · SS claim age">
          <select value={scenarioB.ssClaim} onChange={(e) => setScenarioB((s) => ({ ...s, ssClaim: Number(e.target.value) }))} disabled={!scenarioB.enabled}>
            {[62, 63, 64, 65, 66, 67, 68, 69, 70].map((a) => (
              <option key={a} value={a}>{a}{a === 67 ? " (FRA)" : ""}</option>
            ))}
          </select>
        </Field>
        {filing === "mfj" && (
          <Field label="B · partner SS claim age">
            <select value={scenarioB.partnerSsClaim} onChange={(e) => setScenarioB((s) => ({ ...s, partnerSsClaim: Number(e.target.value) }))} disabled={!scenarioB.enabled}>
              {[62, 63, 64, 65, 66, 67, 68, 69, 70].map((a) => (
                <option key={a} value={a}>{a}{a === 67 ? " (FRA)" : ""}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="B · roth conversion strategy">
          <select value={scenarioB.conversionEnabled ? "on" : "off"} onChange={(e) => setScenarioB((s) => ({ ...s, conversionEnabled: e.target.value === "on" }))} disabled={!scenarioB.enabled}>
            <option value="off">no conversions</option>
            <option value="on">ladder</option>
          </select>
        </Field>
        <Field label="B · conversion from age">
          <input type="number" min={retireAge} max={endAge}
            value={scenarioB.conversionFromAge}
            onChange={(e) => setScenarioB((s) => ({ ...s, conversionFromAge: Number(e.target.value) || retireAge }))}
            disabled={!scenarioB.enabled || !scenarioB.conversionEnabled} />
        </Field>
        <Field label="B · conversion to age">
          <input type="number" min={retireAge} max={endAge}
            value={scenarioB.conversionToAge}
            onChange={(e) => setScenarioB((s) => ({ ...s, conversionToAge: Number(e.target.value) || 72 }))}
            disabled={!scenarioB.enabled || !scenarioB.conversionEnabled} />
        </Field>
        <Field label="B · conversion $/yr">
          <input type="number" min="0" step="5000"
            value={scenarioB.conversionAmount}
            onChange={(e) => setScenarioB((s) => ({ ...s, conversionAmount: Number(e.target.value) || 0 }))}
            disabled={!scenarioB.enabled || !scenarioB.conversionEnabled} />
        </Field>
      </div>

      {/* Chart */}
      {stitchedA && (
        <>
          <h2 className="section">marginal bracket over time</h2>
          <TimelineChart
            scenarioA={stitchedA}
            scenarioB={stitchedB}
            markers={markers}
            lowBracketBand={lowBracketBand}
          />
          {lowBracketBand && (
            <p className="note" style={{ marginTop: "0.5rem" }}>
              <strong>low-bracket window:</strong> ages {lowBracketBand.fromAge}–{lowBracketBand.toAge}{" "}
              project at ≤12% marginal bracket — prime years to realize income via Roth conversion or
              taxable-account harvest before RMDs at 73 push you higher.
            </p>
          )}
        </>
      )}

      {/* Scenario stats comparison */}
      {stats.A && (
        <>
          <h2 className="section">scenario stats</h2>
          <div className="schedule open" style={{ maxHeight: "none", marginBottom: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>A · baseline</th>
                  {stats.B && <th>B · alternate</th>}
                  {stats.B && <th>Δ (B − A)</th>}
                </tr>
              </thead>
              <tbody>
                <StatRow label="Lifetime federal tax" a={stats.A.lifetimeTax} b={stats.B?.lifetimeTax} fmt={fmtMoney} flipColor />
                <StatRow label="Peak real portfolio" a={stats.A.peakReal} b={stats.B?.peakReal} fmt={fmtMoney} />
                <StatRow label={`Ending value (age ${endAge})`} a={stats.A.endingTotal} b={stats.B?.endingTotal} fmt={fmtMoney} />
                <StatRow label="Ending Roth" a={stats.A.endingRoth} b={stats.B?.endingRoth} fmt={fmtMoney} />
                <StatRow label="Depletion age" a={stats.A.depleted} b={stats.B?.depleted} fmt={(v) => v || "never"} />
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Year-by-year */}
      {stitchedA && <YearByYearTable rowsA={stitchedA} rowsB={stitchedB} retireAge={retireAge} />}

      <div className="footer">
        <strong>What's plotted.</strong> Marginal federal bracket on the left axis, gross ordinary
        income on the right axis (shaded area, scenario A). Working-year bracket comes from your
        /cashflow inputs (W-2 + bonus + RSU + other, less pre-tax). Retirement-year bracket comes
        from the projection's ord-income stack: SS taxable share + RMD + Roth conversion + traditional
        withdrawals. State tax and FICA are not on the chart — this is the federal ordinary-income
        marginal rate only.
        <br /><br />
        <strong>Scenario modeling, v1.</strong> Two scenarios overlaid. Saved scenarios (named, stored
        on the profile, reusable across sessions) are a planned add — for now scenario B is
        page-local state, so refreshing resets it. Useful comparisons: SS claim at FRA vs 70,
        conversion ladder vs none, retire-at-60 vs retire-at-65.
      </div>
    </div>
  );
}

function Field({ label, note, children }) {
  return (
    <div>
      <label>{label}</label>
      {children}
      {note !== undefined && <div className="note">{note}</div>}
    </div>
  );
}

function StatRow({ label, a, b, fmt, flipColor }) {
  const delta = (typeof a === "number" && typeof b === "number") ? b - a : null;
  // For tax: down is good (color green for delta < 0). For balance: up is good.
  const goodIfNeg = !!flipColor;
  const deltaColor = delta == null ? "var(--muted)"
    : (goodIfNeg ? (delta < 0 ? "var(--green)" : "var(--red)") : (delta > 0 ? "var(--green)" : "var(--red)"));
  return (
    <tr>
      <td style={{ textAlign: "left", color: "var(--muted)" }}>{label}</td>
      <td>{fmt(a)}</td>
      {b !== undefined && <td>{fmt(b)}</td>}
      {b !== undefined && (
        <td style={{ color: deltaColor }}>
          {delta == null ? "—" : ((delta >= 0 ? "+" : "−") + fmt(Math.abs(delta)))}
        </td>
      )}
    </tr>
  );
}

function YearByYearTable({ rowsA, rowsB, retireAge }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "hide year-by-year" : "show year-by-year"}
      </button>
      {open && (
        <div className="schedule open">
          <table>
            <thead>
              <tr>
                <th>age</th>
                <th>year</th>
                <th>A · ord</th>
                <th>A · bracket</th>
                <th>A · tax</th>
                {rowsB && <th>B · ord</th>}
                {rowsB && <th>B · bracket</th>}
                {rowsB && <th>B · tax</th>}
              </tr>
            </thead>
            <tbody>
              {rowsA.map((r, i) => {
                const rb = rowsB?.[i];
                return (
                  <tr key={r.age} className={r.age === retireAge ? "year-end" : ""}>
                    <td>{r.age}</td>
                    <td>{r.year}</td>
                    <td>{fmtMoney(r.ordIncome)}</td>
                    <td>{pct(r.marginalBracket, 0)}</td>
                    <td>{fmtMoney(r.yearTax)}</td>
                    {rb && <td>{fmtMoney(rb.ordIncome)}</td>}
                    {rb && <td>{pct(rb.marginalBracket, 0)}</td>}
                    {rb && <td>{fmtMoney(rb.yearTax)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
