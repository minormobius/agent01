import { useMemo, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import Link from "../components/Link";
import { useProfile } from "../state/profile";
import { projectPortfolio, monteCarloProject } from "../lib/projection";
import RetireChart from "./RetireChart";
import MonteCarloChart from "./MonteCarloChart";

function fmtMoney(v) {
  if (!isFinite(v) || v === 0) return "$0";
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + Math.round(v / 1e3) + "k";
  return "$" + Math.round(v).toLocaleString();
}
function fmtFullMoney(v) {
  if (!isFinite(v)) return "—";
  return "$" + Math.round(v).toLocaleString();
}
function pct(v, d = 1) {
  return (v * 100).toFixed(d) + "%";
}

// Map profile.accounts (with tax-treatment buckets) into the engine's
// 5-bucket model. Debt and real estate / equity comp are excluded from
// projection — they're not directly drawable liquid assets.
function accountsToBalances(accounts) {
  const sum = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };
  for (const a of accounts || []) {
    if (sum[a.type] !== undefined) sum[a.type] += Number(a.balance) || 0;
  }
  return sum;
}

export default function Retire() {
  const { profile, update } = useProfile();
  const h = profile.household || {};
  const inc = profile.income || {};
  const ass = profile.assumptions || {};

  // ─── Derived inputs ─────────────────────────────────────────────────
  const balances = useMemo(() => accountsToBalances(profile.accounts), [profile.accounts]);
  const totalLiquid = Object.values(balances).reduce((s, v) => s + v, 0);

  // Annual contributions derived from /cashflow inputs
  const annualContrib = useMemo(() => ({
    traditional: Number(inc.pretax?.k401 || 0),
    roth: Number(inc.postTaxSavings?.roth || 0),
    taxable: Number(inc.postTaxSavings?.brokerage || 0) + Number(inc.postTaxSavings?.other || 0),
    hsa: Number(inc.pretax?.hsa || 0),
    cash: 0,
  }), [inc]);
  const totalContrib = Object.values(annualContrib).reduce((s, v) => s + v, 0);

  const setAss = (patch) =>
    update((p) => ({ ...p, assumptions: { ...p.assumptions, ...patch } }));
  const setHH = (patch) =>
    update((p) => ({ ...p, household: { ...p.household, ...patch } }));

  // Local override flags for chart sensitivity — these don't persist
  const [returnOverride, setReturnOverride] = useState(null);

  const currentAge = h.currentAge || 35;
  const retireAge = ass.retireAge || 65;
  const endAge = ass.endAge || 95;
  const targetSpend = Number(ass.targetSpend) || 100000;
  const employerMatch = Number(ass.employerMatch) || 0;
  const realReturn = returnOverride !== null ? returnOverride : (Number(ass.realReturn) || 0.05);
  const filing = h.filing || "single";
  const ss = inc.socialSecurity || {};
  const rc = ass.rothConversion || {};
  const rcEnabled = !!rc.enabled && rc.annualAmount > 0;
  const rcFrom = Number(rc.fromAge) || retireAge;
  const rcTo = Number(rc.toAge) || 72;
  const rcAmount = Number(rc.annualAmount) || 0;

  const setRC = (patch) =>
    update((p) => ({
      ...p,
      assumptions: { ...p.assumptions, rothConversion: { ...p.assumptions.rothConversion, ...patch } },
    }));

  const setSS = (patch) =>
    update((p) => ({
      ...p,
      income: {
        ...p.income,
        socialSecurity: { ...p.income.socialSecurity, ...patch },
      },
    }));

  const canProject = totalLiquid > 0 && currentAge < endAge && retireAge >= currentAge;

  // ─── Run projection (both with-conversion and without, so we can show the delta) ─
  const projInputs = useMemo(() => ({
    currentAge, retireAge, endAge,
    balances, contributions: annualContrib,
    employerMatch, targetSpend, realReturn, filing,
    taxableBasisFrac: ass.taxableBasisFrac ?? 0.6,
    socialSecurity: {
      benefitAtFRA: Number(ss.benefitAtFRA) || 0,
      claimAge: Number(ss.claimAge) || 67,
      partnerBenefitAtFRA: filing === "mfj" ? (Number(ss.partnerBenefitAtFRA) || 0) : 0,
      partnerClaimAge: Number(ss.partnerClaimAge) || 67,
    },
  }), [currentAge, retireAge, endAge, balances, annualContrib, employerMatch, targetSpend, realReturn, filing, ass.taxableBasisFrac, ss.benefitAtFRA, ss.claimAge, ss.partnerBenefitAtFRA, ss.partnerClaimAge]);

  const proj = useMemo(() => {
    if (!canProject) return null;
    return projectPortfolio({
      ...projInputs,
      rothConversion: rcEnabled ? { fromAge: rcFrom, toAge: rcTo, annualAmount: rcAmount } : null,
    });
  }, [canProject, projInputs, rcEnabled, rcFrom, rcTo, rcAmount]);

  // Counterfactual: same scenario, conversion off. Used only for the delta card.
  const projNoConv = useMemo(() => {
    if (!canProject || !rcEnabled) return null;
    return projectPortfolio(projInputs);
  }, [canProject, projInputs, rcEnabled]);

  // ─── Monte Carlo (same inputs as deterministic, mean = realReturn) ─
  const mcStdev = 0.12; // 60/40 historical real-return vol
  const mc = useMemo(() => {
    if (!canProject) return null;
    return monteCarloProject({
      ...projInputs,
      rothConversion: rcEnabled ? { fromAge: rcFrom, toAge: rcTo, annualAmount: rcAmount } : null,
    }, { paths: 1000, stdev: mcStdev });
  }, [canProject, projInputs, rcEnabled, rcFrom, rcTo, rcAmount]);
  const mcNoConv = useMemo(() => {
    if (!canProject || !rcEnabled) return null;
    return monteCarloProject(projInputs, { paths: 1000, stdev: mcStdev });
  }, [canProject, projInputs, rcEnabled]);

  // ─── Conversion windows (low-bracket years pre-RMD) ────────────────
  const conversionWindows = useMemo(() => {
    if (!proj) return [];
    const out = [];
    let runStart = null;
    for (const r of proj.rows) {
      if (r.age >= retireAge && r.age < 73 && r.yearGrossWithdraw < 50000) {
        if (runStart === null) runStart = r.age;
      } else {
        if (runStart !== null) {
          out.push([runStart, proj.rows.find((x) => x.age === runStart)?.age]);
          runStart = null;
        }
      }
    }
    if (runStart !== null) out.push([runStart, retireAge < 73 ? 72 : retireAge]);
    return out;
  }, [proj, retireAge]);

  return (
    <div className="page">
      <SiteHeader section="retire" />
      <p className="subtitle">retirement projection</p>
      <p className="desc">
        year-by-year, tax-aware. balances pulled from <Link to="/networth">/networth</Link>,
        contributions pulled from <Link to="/cashflow">/cashflow</Link>. set your age,
        retire age, and target spend below; one assumption (real return) is yours to vary.
      </p>

      {/* ── Prereq warnings ─────────────────────────────────────── */}
      {totalLiquid === 0 && (
        <div className="warn">
          <strong>no accounts yet.</strong> add cash, taxable, tax-deferred, Roth, or HSA accounts
          on <Link to="/networth">/networth</Link> for the projection to have something to grow.
        </div>
      )}
      {totalContrib === 0 && totalLiquid > 0 && (
        <div className="warn">
          <strong>no contributions.</strong> fill out income + pre-tax + post-tax on{" "}
          <Link to="/cashflow">/cashflow</Link> so the projection knows how much you're adding each year.
        </div>
      )}

      {/* ── Inputs ──────────────────────────────────────────────── */}
      <h2 className="section">your plan</h2>
      <div className="grid">
        <Field label="current age">
          <input type="number" min="18" max="100" step="1"
            value={h.currentAge ?? ""}
            onChange={(e) => setHH({ currentAge: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="retire at age">
          <input type="number" min="30" max="100" step="1"
            value={ass.retireAge ?? 65}
            onChange={(e) => setAss({ retireAge: Number(e.target.value) || 65 })} />
        </Field>
        <Field label="plan to age" note="how long the projection runs">
          <input type="number" min="60" max="110" step="1"
            value={ass.endAge ?? 95}
            onChange={(e) => setAss({ endAge: Number(e.target.value) || 95 })} />
        </Field>
        <Field label="target spend ($/yr, real)" note="after-tax annual spending in retirement">
          <input type="number" min="0" step="5000"
            value={ass.targetSpend ?? 100000}
            onChange={(e) => setAss({ targetSpend: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="employer 401k match ($/yr)" note="goes to traditional bucket">
          <input type="number" min="0" step="500"
            value={ass.employerMatch ?? 0}
            onChange={(e) => setAss({ employerMatch: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="real return assumption (%/yr)" note="inflation-adjusted; 5% is the historical 60/40 baseline">
          <input type="number" min="-5" max="15" step="0.1"
            value={returnOverride !== null ? returnOverride * 100 : (ass.realReturn || 0.05) * 100}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              if (returnOverride !== null) setReturnOverride(v);
              else setAss({ realReturn: v });
            }} />
        </Field>
      </div>
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={() => setReturnOverride(0.03)}>stress: 3% real</button>
        <button onClick={() => setReturnOverride(0.05)}>baseline: 5% real</button>
        <button onClick={() => setReturnOverride(0.07)}>optimistic: 7% real</button>
        {returnOverride !== null && (
          <button onClick={() => setReturnOverride(null)} className="danger">
            clear scenario · use saved {pct(ass.realReturn || 0.05)}
          </button>
        )}
      </div>

      {/* ── Social Security ────────────────────────────────────── */}
      <h2 className="section">social security</h2>
      <p className="desc" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        Annual benefit at full retirement age (FRA, 67 for those born 1960+),
        in <em>today's dollars</em>. Get this from your SSA statement at{" "}
        <a href="https://www.ssa.gov/myaccount/" target="_blank" rel="noreferrer">ssa.gov/myaccount</a>.
        Claim age 62 = 70% of FRA benefit, 70 = 124% (8%/yr delayed-retirement credits).
        For planning we treat 85% of SS as taxable ordinary income (the cap that most
        retirees with meaningful other income hit).
      </p>
      <div className="grid">
        <Field label="your benefit at FRA ($/yr, today's $)" note="from your SSA statement">
          <input type="number" min="0" step="500"
            value={ss.benefitAtFRA ?? ""}
            onChange={(e) => setSS({ benefitAtFRA: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="your claim age">
          <select value={ss.claimAge ?? 67} onChange={(e) => setSS({ claimAge: Number(e.target.value) })}>
            {[62, 63, 64, 65, 66, 67, 68, 69, 70].map((a) => (
              <option key={a} value={a}>{a}{a === 67 ? " (FRA)" : ""}</option>
            ))}
          </select>
        </Field>
        {filing === "mfj" && (
          <>
            <Field label="partner benefit at FRA ($/yr, today's $)">
              <input type="number" min="0" step="500"
                value={ss.partnerBenefitAtFRA ?? ""}
                onChange={(e) => setSS({ partnerBenefitAtFRA: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="partner claim age">
              <select value={ss.partnerClaimAge ?? 67} onChange={(e) => setSS({ partnerClaimAge: Number(e.target.value) })}>
                {[62, 63, 64, 65, 66, 67, 68, 69, 70].map((a) => (
                  <option key={a} value={a}>{a}{a === 67 ? " (FRA)" : ""}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>

      {/* ── Roth conversion ladder ─────────────────────────────── */}
      <h2 className="section">roth conversion ladder</h2>
      <p className="desc" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        Voluntarily move money from tax-deferred → Roth during low-bracket years
        (typically between retirement and age 73). Tax is owed on the converted
        amount as ordinary income that year — but it then grows tax-free forever,
        is never subject to RMDs, and inherits tax-free. Wins when your conversion
        bracket is lower than your future RMD bracket; can lose when it's higher.
        Toggle on and compare the deltas below.
      </p>
      <div className="grid">
        <Field label="strategy" note={rcEnabled ? "running with conversion" : "off — turn on to simulate"}>
          <select value={rcEnabled ? "on" : "off"} onChange={(e) => setRC({ enabled: e.target.value === "on" })}>
            <option value="off">off (baseline)</option>
            <option value="on">on — ladder</option>
          </select>
        </Field>
        <Field label="from age">
          <input type="number" min={retireAge} max={endAge} step="1"
            value={rc.fromAge ?? retireAge}
            onChange={(e) => setRC({ fromAge: Number(e.target.value) || retireAge })}
            disabled={!rcEnabled} />
        </Field>
        <Field label="to age" note="conversions stop after this age (RMDs start at 73)">
          <input type="number" min={retireAge} max={endAge} step="1"
            value={rc.toAge ?? 72}
            onChange={(e) => setRC({ toAge: Number(e.target.value) || 72 })}
            disabled={!rcEnabled} />
        </Field>
        <Field label="annual amount ($/yr, real)">
          <input type="number" min="0" step="5000"
            value={rc.annualAmount ?? 0}
            onChange={(e) => setRC({ annualAmount: Number(e.target.value) || 0 })}
            disabled={!rcEnabled} />
        </Field>
      </div>

      {/* ── Starting position ───────────────────────────────────── */}
      <h2 className="section">starting position</h2>
      <div className="aggregates" style={{ marginBottom: "0.5rem" }}>
        <Stat k="Liquid net worth" v={fmtMoney(totalLiquid)} />
        <Stat k="Cash" v={fmtMoney(balances.cash)} />
        <Stat k="Taxable" v={fmtMoney(balances.taxable)} />
        <Stat k="Tax-deferred" v={fmtMoney(balances.traditional)} />
        <Stat k="Roth" v={fmtMoney(balances.roth)} />
        <Stat k="HSA" v={fmtMoney(balances.hsa)} />
        <Stat k="Annual contributions" v={fmtMoney(totalContrib + employerMatch) + "/yr"} />
      </div>

      {/* ── Hero outcome ────────────────────────────────────────── */}
      {proj && <Outcome proj={proj} mc={mc} targetSpend={targetSpend} retireAge={retireAge} endAge={endAge} />}

      {/* ── Roth conversion comparison (only when on) ──────────── */}
      {projNoConv && <ConversionDelta proj={proj} projNoConv={projNoConv} mc={mc} mcNoConv={mcNoConv} rc={{ fromAge: rcFrom, toAge: rcTo, annualAmount: rcAmount }} />}

      {/* ── Chart: deterministic bucket breakdown ──────────────── */}
      {proj && (
        <>
          <h2 className="section">portfolio over time · by tax bucket (mean return)</h2>
          <RetireChart rows={proj.rows} retireAge={retireAge} depletedAtAge={proj.depletedAtAge} />
        </>
      )}

      {/* ── Chart: Monte Carlo fan ─────────────────────────────── */}
      {mc && (
        <>
          <h2 className="section">total real value · Monte Carlo ({mc.paths.toLocaleString()} paths, σ={(mc.stdev * 100).toFixed(0)}%)</h2>
          <MonteCarloChart
            bands={mc.bands}
            retireAge={retireAge}
            medianDepleteAge={mc.medianDepleteAge}
            successRate={mc.successRate}
          />
        </>
      )}

      {/* ── Milestones ──────────────────────────────────────────── */}
      {proj && (
        <>
          <h2 className="section">milestones</h2>
          <MilestoneList proj={proj} retireAge={retireAge} conversionWindows={conversionWindows} />
        </>
      )}

      {/* ── Year-by-year table (collapsible) ────────────────────── */}
      {proj && <YearTable rows={proj.rows} retireAge={retireAge} />}

      <div className="footer">
        <strong>Method.</strong> Deterministic single-path projection in real dollars. Each year:
        apply real return to every bucket, add contributions while working, withdraw to meet
        target spend in tax-efficient order (cash → taxable → traditional → HSA post-65 → Roth)
        once retired. RMDs from age 73 use the IRS Uniform Lifetime Table; if the RMD exceeds
        spend, the excess after-tax cash reinvests to the taxable bucket. Federal income tax uses
        2025 brackets flat across all years; LTCG on taxable withdrawals assumes a configurable
        basis fraction (default 60%).
        <br /><br />
        <strong>Monte Carlo.</strong> 1000 paths sampling annual real returns from
        Normal(mean = your saved return, σ = 12% — the historical realized real-return
        volatility of a US 60/40 portfolio). Bands show the p10/p25/p50/p75/p90 of
        total real portfolio value year by year; the success rate is the fraction of
        paths that didn't deplete by your end age. Seed is fixed so the chart doesn't
        jitter on every keystroke.
        <br /><br />
        <strong>Not modeled (still).</strong> ACA premium subsidies / Medicare IRMAA,
        state tax on retirement withdrawals, NIIT, bracket inflation, the full
        provisional-income calc for SS (we use the 85% cap). Roth conversion simulator
        is the next planned add — the engine already flags low-bracket windows.
        <br /><br />
        <strong>Conversion windows.</strong> Years between retirement and age 73 where ordinary
        income is low are prime for Roth conversions: pay tax now at a low bracket to shift money
        into the Roth bucket before RMDs force it out at a (likely higher) bracket. The engine
        flags these but doesn't simulate the conversion itself — that's a v2 add too.
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function Field({ label, note, children }) {
  return (
    <div>
      <label>{label}</label>
      {children}
      {note !== undefined && <div className="note">{note}</div>}
    </div>
  );
}

function Stat({ k, v }) {
  return (
    <div className="a-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

// Side-by-side: with-conversion vs without. Lifetime tax, ending Roth, ending
// total, and (if Monte Carlo ran) success-rate delta. Win/loss color comes
// from the legacy-value delta; flagged with a note when MC and deterministic
// disagree on which is better.
function ConversionDelta({ proj, projNoConv, mc, mcNoConv, rc }) {
  const tot = (rows) => rows.reduce((s, r) => s + (r.yearTax || 0), 0);
  const last = (rows) => rows[rows.length - 1];

  const taxWith = tot(proj.rows);
  const taxNo = tot(projNoConv.rows);
  const rothWith = last(proj.rows).balances.roth;
  const rothNo = last(projNoConv.rows).balances.roth;
  const totalWith = last(proj.rows).totalReal;
  const totalNo = last(projNoConv.rows).totalReal;
  const totalDelta = totalWith - totalNo;
  const isWin = totalDelta >= 0;

  const srDelta = mc && mcNoConv ? (mc.successRate - mcNoConv.successRate) : null;

  return (
    <div className="summary" style={{ borderColor: isWin ? "var(--green)" : "var(--red)", marginTop: "1rem" }}>
      <div className="total">
        <span className="lbl">
          conversion ladder · ${rc.annualAmount.toLocaleString()}/yr · age {rc.fromAge}–{rc.toAge}
        </span>
        <span className="val" style={{ color: isWin ? "var(--green)" : "var(--red)" }}>
          {isWin ? "+" : "−"}{fmtFullMoney(Math.abs(totalDelta))}
        </span>
      </div>
      <div className="breakdown">
        <RowKV k="Legacy delta (vs baseline)" v={(totalDelta >= 0 ? "+" : "−") + fmtFullMoney(Math.abs(totalDelta))} />
        <RowKV k="Lifetime tax · with" v={fmtFullMoney(taxWith)} />
        <RowKV k="Lifetime tax · baseline" v={fmtFullMoney(taxNo)} />
        <RowKV k="Lifetime tax delta" v={(taxWith - taxNo >= 0 ? "+" : "−") + fmtFullMoney(Math.abs(taxWith - taxNo))} />
        <RowKV k="Ending Roth · with" v={fmtFullMoney(rothWith)} />
        <RowKV k="Ending Roth · baseline" v={fmtFullMoney(rothNo)} />
        {srDelta !== null && (
          <RowKV
            k={`MC success rate · with vs baseline`}
            v={`${(mc.successRate * 100).toFixed(1)}% vs ${(mcNoConv.successRate * 100).toFixed(1)}% (${srDelta >= 0 ? "+" : ""}${(srDelta * 100).toFixed(1)} pts)`}
          />
        )}
      </div>
      <p className="note" style={{ marginTop: "0.5rem" }}>
        {isWin
          ? "ladder is helpful for this scenario — converting at today's brackets saves more than the immediate tax cost."
          : "ladder is unhelpful for this scenario — you're paying conversion tax now without escaping higher brackets later. try a narrower window, smaller annual amount, or extending the to-age cap."}
      </p>
    </div>
  );
}

function RowKV({ k, v }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function Outcome({ proj, mc, targetSpend, retireAge, endAge }) {
  const lastRow = proj.rows[proj.rows.length - 1];
  const detOk = !proj.depleted;
  // Use success rate to color the hero card if MC ran; otherwise deterministic.
  const sr = mc?.successRate ?? (detOk ? 1 : 0);
  const heroColor = sr >= 0.85 ? "var(--green)" : sr >= 0.6 ? "var(--c-traditional)" : "var(--red)";
  const heroLabel = sr >= 0.85 ? "plan looks robust"
    : sr >= 0.6 ? "plan is workable but tight"
    : "plan is fragile";

  return (
    <div className="summary" style={{ borderColor: heroColor }}>
      <div className="total">
        <span className="lbl">{heroLabel}</span>
        <span className="val" style={{ color: heroColor }}>
          {mc ? `${(sr * 100).toFixed(0)}% success` : (detOk ? `to age ${endAge}` : `runs out ${proj.depletedAtAge}`)}
        </span>
      </div>
      <div className="breakdown">
        <Row k="Target spend (real)" v={fmtFullMoney(targetSpend) + "/yr"} />
        {mc && (
          <Row
            k={`Monte Carlo success rate (${mc.paths.toLocaleString()} paths, σ ${(mc.stdev * 100).toFixed(0)}%)`}
            v={`${(mc.successRate * 100).toFixed(1)}%${mc.medianDepleteAge ? ` (failures median depletion age ${mc.medianDepleteAge})` : ""}`}
          />
        )}
        <Row k="Deterministic peak (mean return)" v={fmtFullMoney(proj.peakRealValue) + ` (age ${proj.peakAtAge})`} />
        <Row k={`Value at retire (age ${retireAge})`} v={fmtFullMoney(
          proj.rows.find((r) => r.age === retireAge)?.totalReal ?? 0
        )} />
        <Row k={`Deterministic value at age ${endAge}`} v={fmtFullMoney(lastRow?.totalReal ?? 0)} />
        {mc && (
          <Row
            k={`Monte Carlo p10–p90 at age ${endAge}`}
            v={`${fmtFullMoney(mc.bands[mc.bands.length - 1].p10)} – ${fmtFullMoney(mc.bands[mc.bands.length - 1].p90)}`}
          />
        )}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function MilestoneList({ proj, retireAge, conversionWindows }) {
  const milestones = [];
  const retireRow = proj.rows.find((r) => r.age === retireAge);
  if (retireRow) {
    milestones.push({
      age: retireAge, year: retireRow.year,
      title: "Retirement starts",
      detail: `Portfolio: ${fmtFullMoney(retireRow.totalReal)}. Begin withdrawals from cash + taxable first.`,
    });
  }
  const rmdRow = proj.rows.find((r) => r.age === 73);
  if (rmdRow) {
    milestones.push({
      age: 73, year: rmdRow.year,
      title: "RMDs begin",
      detail: `First-year RMD: ${fmtFullMoney(rmdRow.yearRMD)}. Tax-deferred balance: ${fmtFullMoney(rmdRow.balances.traditional)}.`,
    });
  }
  if (conversionWindows.length > 0) {
    for (const [from] of conversionWindows) {
      const w = proj.rows.find((r) => r.age === from);
      if (!w) continue;
      milestones.push({
        age: from, year: w.year,
        title: "Roth conversion window opens",
        detail: `Low ordinary income (${fmtFullMoney(w.yearGrossWithdraw)}) — prime years to convert traditional → Roth at favorable brackets.`,
      });
      break; // only show the first window for clarity
    }
  }
  if (proj.depletedAtAge) {
    const r = proj.rows.find((x) => x.age === proj.depletedAtAge);
    milestones.push({
      age: proj.depletedAtAge, year: r?.year,
      title: "Portfolio depleted",
      detail: `At target spend, you run out. Reduce spend, work longer, or expect lower returns.`,
    });
  }
  milestones.sort((a, b) => a.age - b.age);

  return (
    <div className="milestones">
      {milestones.map((m, i) => (
        <div key={i} className="milestone">
          <div className="milestone-age">
            <div className="age">{m.age}</div>
            <div className="year">{m.year}</div>
          </div>
          <div className="milestone-body">
            <div className="title">{m.title}</div>
            <div className="detail">{m.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function YearTable({ rows, retireAge }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="toggle" onClick={() => setOpen((o) => !o)} style={{ marginTop: "2rem" }}>
        {open ? "hide year-by-year" : "show year-by-year"}
      </button>
      {open && (
        <div className="schedule open">
          <table>
            <thead>
              <tr>
                <th>age</th>
                <th>year</th>
                <th>total</th>
                <th>cash</th>
                <th>taxable</th>
                <th>trad</th>
                <th>roth</th>
                <th>hsa</th>
                <th>SS</th>
                <th>conv</th>
                <th>withdraw</th>
                <th>RMD</th>
                <th>tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.age} className={r.age === retireAge ? "year-end" : ""}>
                  <td>{r.age}</td>
                  <td>{r.year}</td>
                  <td>{fmtMoney(r.totalReal)}</td>
                  <td>{fmtMoney(r.balances.cash)}</td>
                  <td>{fmtMoney(r.balances.taxable)}</td>
                  <td>{fmtMoney(r.balances.traditional)}</td>
                  <td>{fmtMoney(r.balances.roth)}</td>
                  <td>{fmtMoney(r.balances.hsa)}</td>
                  <td>{r.yearSS ? fmtMoney(r.yearSS) : ""}</td>
                  <td>{r.yearConversion ? fmtMoney(r.yearConversion) : ""}</td>
                  <td>{r.yearGrossWithdraw ? fmtMoney(r.yearGrossWithdraw) : ""}</td>
                  <td>{r.yearRMD ? fmtMoney(r.yearRMD) : ""}</td>
                  <td>{r.yearTax ? fmtMoney(r.yearTax) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
