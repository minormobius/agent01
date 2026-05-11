import { useMemo, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import Link from "../components/Link";
import { useProfile } from "../state/profile";
import { projectPortfolio } from "../lib/projection";
import RetireChart from "./RetireChart";

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

  const canProject = totalLiquid > 0 && currentAge < endAge && retireAge >= currentAge;

  // ─── Run projection ────────────────────────────────────────────────
  const proj = useMemo(() => {
    if (!canProject) return null;
    return projectPortfolio({
      currentAge, retireAge, endAge,
      balances, contributions: annualContrib,
      employerMatch, targetSpend, realReturn, filing,
      taxableBasisFrac: ass.taxableBasisFrac ?? 0.6,
    });
  }, [canProject, currentAge, retireAge, endAge, balances, annualContrib, employerMatch, targetSpend, realReturn, filing, ass.taxableBasisFrac]);

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
      {proj && <Outcome proj={proj} targetSpend={targetSpend} retireAge={retireAge} endAge={endAge} />}

      {/* ── Chart ───────────────────────────────────────────────── */}
      {proj && (
        <>
          <h2 className="section">portfolio over time (real $)</h2>
          <RetireChart rows={proj.rows} retireAge={retireAge} depletedAtAge={proj.depletedAtAge} />
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
        <strong>Not modeled (v1).</strong> Social Security, ACA premium subsidies / Medicare IRMAA,
        state tax on withdrawals, NIIT, sequence-of-returns risk, bracket inflation. Monte Carlo
        with 10k paths is the planned v2 add — it'll surface success probability rather than the
        single-path success/fail signal here.
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

function Outcome({ proj, targetSpend, retireAge, endAge }) {
  const lastRow = proj.rows[proj.rows.length - 1];
  const ok = !proj.depleted;
  return (
    <div className="summary" style={{ borderColor: ok ? "var(--green)" : "var(--red)" }}>
      <div className="total">
        <span className="lbl">{ok ? "lasts the plan" : "runs out early"}</span>
        <span className="val" style={{ color: ok ? "var(--green)" : "var(--red)" }}>
          {ok ? `to age ${endAge}` : `at age ${proj.depletedAtAge}`}
        </span>
      </div>
      <div className="breakdown">
        <Row k={`Target spend (real)`} v={fmtFullMoney(targetSpend) + "/yr"} />
        <Row k="Peak real value" v={fmtFullMoney(proj.peakRealValue) + ` (age ${proj.peakAtAge})`} />
        <Row k={`Value at retire (age ${retireAge})`} v={fmtFullMoney(
          proj.rows.find((r) => r.age === retireAge)?.totalReal ?? 0
        )} />
        <Row k={`Value at end (age ${endAge})`} v={fmtFullMoney(lastRow?.totalReal ?? 0)} />
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
