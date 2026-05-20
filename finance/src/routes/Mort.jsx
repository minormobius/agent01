import { useState, useEffect, useMemo, useRef } from "react";
import SiteHeader from "../components/SiteHeader";
import { useProfile } from "../state/profile";
import { STATES } from "../lib/states";
import {
  STD_DED_2025,
  MORT_INT_CAP,
  saltCapForYear,
  federalTax,
  marginalRate,
} from "../lib/tax";
import { amortize, yearlyInterest } from "../lib/amortize";
import MortChart from "./MortChart";
import MortSchedule from "./MortSchedule";

const STATE_BY_FIPS = Object.fromEntries(STATES.map((s) => [s[1], s]));

function parseDownInput(value, price) {
  const v = (value || "").trim();
  if (!v) return { amount: 0, pct: 0 };
  if (v.endsWith("%")) {
    const pct = parseFloat(v) / 100;
    return { amount: price * pct, pct };
  }
  const amt = parseFloat(v.replace(/[$,]/g, ""));
  return { amount: amt, pct: price ? amt / price : 0 };
}

function fmtMoney(v, decimals = 0) {
  if (!isFinite(v)) return "—";
  return "$" + v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(v, decimals = 2) {
  return (v * 100).toFixed(decimals) + "%";
}

export default function Mort() {
  const { profile, update: updateProfile } = useProfile();

  // Property-specific inputs (local). Saving as a profile.properties[i]
  // is a planned follow-up — for now this just edits one in-flight scenario.
  const [price, setPrice] = useState(450000);
  const [down, setDown] = useState("20%");
  const [term, setTerm] = useState(30);
  const [rate, setRate] = useState(6.5);
  const [tax, setTax] = useState(1.0);
  const [ins, setIns] = useState(1500);
  const [hoa, setHoa] = useState(0);
  const [util, setUtil] = useState(300);
  const [pmi, setPmi] = useState(true);
  const [otherItem, setOtherItem] = useState(0);

  // These three live on the profile so the same household answers flow
  // through every planning tool (cashflow, retire, etc.).
  const filing = profile.household?.filing || "single";
  const stateFips = profile.household?.stateFips || "";
  const magi = profile.income?.magi ?? "";

  const setFiling = (f) =>
    updateProfile((p) => ({ ...p, household: { ...p.household, filing: f || "single" } }));
  const setStateFips = (fips) =>
    updateProfile((p) => ({ ...p, household: { ...p.household, stateFips: fips || null } }));
  const setMagi = (v) =>
    updateProfile((p) => ({ ...p, income: { ...p.income, magi: v === "" ? null : Number(v) } }));

  // State income tax: profile-resident, but with a "manual override" bit
  // so the auto-from-state recalc doesn't clobber a user's entered figure.
  const stateinc = profile.income?.stateIncTax ?? "";
  const stateIncIsAuto = profile.income?.stateIncTaxAuto !== false;
  const setStateinc = (v, manual = false) =>
    updateProfile((p) => ({
      ...p,
      income: {
        ...p.income,
        stateIncTax: v === "" ? null : Number(v),
        ...(manual ? { stateIncTaxAuto: false } : {}),
      },
    }));

  // Live data — county list from Census, latest 30y rate from FRED
  const [counties, setCounties] = useState([]);
  const [countyFips, setCountyFips] = useState("");
  const [countyNote, setCountyNote] = useState("");
  const [rateNote, setRateNote] = useState("fetching latest…");
  const [taxNote, setTaxNote] = useState("");
  const [insNote, setInsNote] = useState("");
  const [utilNote, setUtilNote] = useState("");
  const [stateincNote, setStateincNote] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const filingChosen = !!filing && magi !== "" && Number(magi) > 0;

  // Auto-compute state income tax estimate when state or MAGI changes
  // (only if the user hasn't manually overridden).
  useEffect(() => {
    if (!stateIncIsAuto) return;
    if (!stateFips || !magi || Number(magi) <= 0) {
      setStateincNote("enter income + state to auto-estimate");
      return;
    }
    const s = STATE_BY_FIPS[stateFips];
    if (!s) return;
    const stateRate = s[6] / 100;
    const est = Math.round(Number(magi) * stateRate);
    setStateinc(est);
    setStateincNote(`auto: ${s[2]} effective ${(stateRate * 100).toFixed(2)}% × MAGI (override below)`);
  }, [stateFips, magi, stateIncIsAuto]);

  // Apply state defaults (property tax / insurance / utilities) when state changes
  const lastAppliedState = useRef(null);
  useEffect(() => {
    if (!stateFips || lastAppliedState.current === stateFips) return;
    lastAppliedState.current = stateFips;
    const s = STATE_BY_FIPS[stateFips];
    if (!s) return;
    const [, , name, taxPct, insAnnual, utilMonthly] = s;
    setTax(taxPct);
    setTaxNote(`${name} avg effective rate · Tax Foundation 2023`);
    setIns(insAnnual);
    setInsNote(`${name} avg homeowner's premium · NAIC`);
    setUtil(utilMonthly);
    setUtilNote(`${name} avg residential utilities · EIA`);

    // Fetch county list
    setCounties([]);
    setCountyFips("");
    setCountyNote("loading counties…");
    fetch(`https://api.census.gov/data/2022/acs/acs5?get=NAME&for=county:*&in=state:${stateFips}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const list = data.slice(1).map((row) => ({
          name: row[0].replace(/, .+$/, ""),
          fips: row[2],
        })).sort((a, b) => a.name.localeCompare(b.name));
        setCounties(list);
        setCountyNote(`${list.length} counties · Census ACS 5-yr 2022`);
      })
      .catch(() => setCountyNote("county list unavailable"));
  }, [stateFips]);

  // County context (median home value)
  useEffect(() => {
    if (!countyFips || !stateFips) return;
    setCountyNote("fetching county data…");
    fetch(`https://api.census.gov/data/2022/acs/acs5?get=NAME,B25077_001E&for=county:${countyFips}&in=state:${stateFips}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const v = parseFloat(data[1][1]);
        if (isFinite(v) && v > 0) {
          setCountyNote(`median home value in this county: ${fmtMoney(v)} (ACS 2022)`);
        } else {
          setCountyNote("county selected · no ACS home value");
        }
      })
      .catch(() => setCountyNote("county selected · ACS unavailable"));
  }, [countyFips, stateFips]);

  // FRED 30y rate — fetch once on mount via our CORS proxy (workers/fred-proxy/).
  // The direct fred.stlouisfed.org endpoint blocks browser fetches on CORS;
  // fred.mino.mobi proxies it server-side with permissive headers + edge cache.
  useEffect(() => {
    fetch("https://fred.mino.mobi/?id=MORTGAGE30US")
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => {
        const lines = text.trim().split("\n").filter(Boolean);
        for (let i = lines.length - 1; i >= 1; i--) {
          const [date, raw] = lines[i].split(",");
          const v = parseFloat(raw);
          if (isFinite(v)) {
            setRate(v);
            setRateNote(`FRED MORTGAGE30US, week of ${date}`);
            return;
          }
        }
        throw new Error("no rows");
      })
      .catch(() => setRateNote("using default 6.50% — live rate unavailable"));
  }, []);

  // ─── Calc (memoized on every input change) ──────────────────────────
  const c = useMemo(() => {
    const dn = parseDownInput(down, Number(price) || 0);
    const loan = Math.max(0, (Number(price) || 0) - dn.amount);
    const months = Number(term) * 12;
    const annualRate = (Number(rate) || 0) / 100;
    const taxPct = (Number(tax) || 0) / 100;

    const am = amortize({
      price: Number(price) || 0,
      loan,
      annualRate,
      months,
      propTaxRate: taxPct,
      insAnnual: Number(ins) || 0,
      hoa: Number(hoa) || 0,
      util: Number(util) || 0,
      pmi: { enabled: !!pmi },
    });

    let taxResult = null;
    if (filingChosen) {
      const std = STD_DED_2025[filing];
      const propTaxYr = (Number(price) || 0) * taxPct;
      const startYear = new Date().getFullYear();
      const interestPerYear = yearlyInterest(am.rows, Number(term));
      const intDeductFrac = loan <= MORT_INT_CAP ? 1 : MORT_INT_CAP / loan;
      const stateIncAnnual = Number(stateinc) || 0;
      const otherItemNum = Number(otherItem) || 0;
      const magiNum = Number(magi) || 0;

      const yearly = [];
      for (let y = 0; y < Number(term); y++) {
        const calYear = startYear + y;
        const cap = saltCapForYear(calYear, magiNum, filing);
        const intDed = interestPerYear[y] * intDeductFrac;

        const baselineSALT = Math.min(stateIncAnnual, cap);
        const baselineItem = baselineSALT + otherItemNum;
        const baselineDed = Math.max(std, baselineItem);

        const withHomeSALT = Math.min(stateIncAnnual + propTaxYr, cap);
        const withHomeItem = withHomeSALT + intDed + otherItemNum;
        const withHomeDed = Math.max(std, withHomeItem);

        const benefit = Math.max(
          0,
          federalTax(Math.max(0, magiNum - baselineDed), filing) -
            federalTax(Math.max(0, magiNum - withHomeDed), filing)
        );

        yearly.push({
          year: calYear, cap, intDed, propTax: propTaxYr,
          baselineDed, withHomeDed,
          itemizes: withHomeItem > std,
          benefit,
        });
      }

      const totalBenefit = yearly.reduce((s, y) => s + y.benefit, 0);
      const yr1 = yearly[0] || { benefit: 0 };
      const margRate = marginalRate(Math.max(0, magiNum - (yr1.withHomeDed || 0)), filing);

      taxResult = {
        std, yearly,
        yr1Benefit: yr1.benefit,
        yr1Cap: yr1.cap,
        yr1Itemizes: yr1.itemizes,
        totalBenefit,
        marginalRate: margRate,
      };
    }

    return {
      price: Number(price) || 0,
      downAmt: dn.amount,
      downPct: dn.pct,
      loan, term: Number(term), months, annualRate,
      pi: am.pi, monthlyTax: am.monthlyTax, monthlyIns: am.monthlyIns,
      hoa: Number(hoa) || 0, util: Number(util) || 0,
      pmiActive: am.pmiEnabled, baseMonthlyPMI: am.baseMonthlyPMI,
      pmiEndsAt: am.pmiEndsAt,
      rows: am.rows, cumInterest: am.cumInterest,
      tax: taxResult,
    };
  }, [price, down, term, rate, tax, ins, hoa, util, pmi, filing, magi, stateinc, otherItem, filingChosen]);

  // ─── Render ─────────────────────────────────────────────────────────
  const downNote = down.trim().endsWith("%")
    ? `= ${fmtMoney(c.downAmt)} (${(c.downPct * 100).toFixed(1)}%)`
    : `= ${(c.downPct * 100).toFixed(1)}% of price`;

  const firstTotal = c.rows[0]?.payment || 0;
  const lastRow = c.rows[c.rows.length - 1];
  const totalInterest = lastRow ? lastRow.cumInterest : 0;
  const totalPaid = c.loan + totalInterest;
  const now = new Date();
  const payoff = new Date(now.getFullYear(), now.getMonth() + c.months, 1);
  const payoffStr = payoff.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const pmiNote = c.pmiActive && c.pmiEndsAt
    ? `PMI removes at month ${c.pmiEndsAt} (${Math.floor(c.pmiEndsAt / 12)}y ${c.pmiEndsAt % 12}m)`
    : (c.pmiActive ? "PMI runs the full term" : "");

  const breakdownRows = [
    ["Principal & Interest", c.pi],
    ["Property Tax", c.monthlyTax],
    ["Insurance", c.monthlyIns],
    ["PMI", c.pmiActive ? c.baseMonthlyPMI : 0],
    ["HOA", c.hoa],
    ["Utilities", c.util],
  ];

  const aggRows = [
    ["Loan amount", fmtMoney(c.loan)],
    ["Total interest", fmtMoney(totalInterest)],
    ["Total paid (P&I)", fmtMoney(totalPaid)],
    ["Payoff date", payoffStr],
  ];
  if (pmiNote) aggRows.push(["PMI", pmiNote]);
  if (c.tax) {
    aggRows.push(["Federal marginal bracket", fmtPct(c.tax.marginalRate, 0)]);
    aggRows.push(["Yr 1 tax benefit", fmtMoney(c.tax.yr1Benefit) + "/yr"]);
    aggRows.push([`${c.term}-yr tax benefit`, fmtMoney(c.tax.totalBenefit)]);
  }

  return (
    <div className="page">
      <SiteHeader section="mort" />
      <p className="subtitle">mortgage calculator</p>
      <p className="desc">can you afford it? amortization plus tax, insurance, and utilities. defaults pulled live from FRED and the US Census.</p>

      <h2 className="section">loan</h2>
      <div className="grid">
        <Field label="home price ($)">
          <input type="number" inputMode="decimal" min="0" step="1000" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="down payment" note={downNote}>
          <input type="text" inputMode="decimal" placeholder="20% or 90000" value={down} onChange={(e) => setDown(e.target.value)} />
        </Field>
        <Field label="term (years)">
          <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            <option value={30}>30</option>
            <option value={20}>20</option>
            <option value={15}>15</option>
            <option value={10}>10</option>
          </select>
        </Field>
        <Field label="interest rate (%)" note={rateNote}>
          <input type="number" inputMode="decimal" min="0" max="25" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
      </div>

      <h2 className="section">location · taxes · ownership costs</h2>
      <div className="grid">
        <Field label="state">
          <select value={stateFips} onChange={(e) => setStateFips(e.target.value)}>
            <option value="">— select a state —</option>
            {STATES.map(([abbr, fips, name]) => (
              <option key={fips} value={fips}>{name}</option>
            ))}
          </select>
        </Field>
        <Field label="county" note={countyNote}>
          <select value={countyFips} onChange={(e) => setCountyFips(e.target.value)} disabled={counties.length === 0}>
            <option value="">{counties.length === 0 ? "— pick a state first —" : "— select a county —"}</option>
            {counties.map((c) => (
              <option key={c.fips} value={c.fips}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="property tax rate (%/yr)" note={taxNote}>
          <input type="number" inputMode="decimal" min="0" max="10" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
        </Field>
        <Field label="homeowner's insurance ($/yr)" note={insNote}>
          <input type="number" inputMode="decimal" min="0" step="50" value={ins} onChange={(e) => setIns(e.target.value)} />
        </Field>
        <Field label="HOA ($/mo)">
          <input type="number" inputMode="decimal" min="0" step="10" value={hoa} onChange={(e) => setHoa(e.target.value)} />
        </Field>
        <Field label="utilities ($/mo)" note={utilNote}>
          <input type="number" inputMode="decimal" min="0" step="10" value={util} onChange={(e) => setUtil(e.target.value)} />
        </Field>
        <div className="full checkbox-row">
          <input id="pmi-toggle" type="checkbox" checked={pmi} onChange={(e) => setPmi(e.target.checked)} />
          <label htmlFor="pmi-toggle" style={{ margin: 0, textTransform: "none", letterSpacing: "normal", fontSize: "0.8rem" }}>
            include PMI when down payment is under 20% (auto-removes at 78% LTV)
          </label>
        </div>
      </div>

      <h2 className="section">tax · federal deduction</h2>
      <p className="desc" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        Federal tax benefit of owning. We compare your standard-vs-itemized position with and
        without the house, year by year. Accounts for SALT cap ($40k under OBBBA through 2029,
        then $10k), mortgage interest cap ($750k acquisition debt), and the MAGI-based SALT
        phase-down above $500k. Filing, state, and income persist across every tool here.
      </p>
      <div className="grid">
        <Field label="filing status">
          <select value={filing} onChange={(e) => setFiling(e.target.value)}>
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
            <option value="hoh">Head of household</option>
            <option value="mfs">Married filing separately</option>
          </select>
        </Field>
        <Field label="household income / MAGI ($/yr)">
          <input type="number" inputMode="decimal" min="0" step="1000" placeholder="e.g. 250000" value={magi ?? ""} onChange={(e) => setMagi(e.target.value)} />
        </Field>
        <Field label="state income tax owed ($/yr)" note={stateincNote}>
          <input
            type="number" inputMode="decimal" min="0" step="100"
            placeholder="auto from state + income"
            value={stateinc ?? ""}
            onChange={(e) => { setStateinc(e.target.value, true); setStateincNote("manual override"); }}
          />
        </Field>
        <Field label="other itemizable ($/yr)" note="charitable, medical over 7.5% AGI, etc.">
          <input type="number" inputMode="decimal" min="0" step="100" value={otherItem} onChange={(e) => setOtherItem(e.target.value)} />
        </Field>
      </div>

      <div className="summary">
        <div className="total">
          <span className="lbl">monthly total</span>
          <span className="val">{fmtMoney(firstTotal)}</span>
        </div>
        <div className="breakdown">
          {breakdownRows.map(([k, v]) => (
            <div key={k} className={`row${v === 0 ? " zero" : ""}`}>
              <span className="k">{k}</span>
              <span className="v">{fmtMoney(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {c.tax && (
        <div className="summary aftertax">
          <div className="total">
            <span className="lbl">monthly after-tax (yr 1)</span>
            <span className="val">{fmtMoney(firstTotal - c.tax.yr1Benefit / 12)}</span>
          </div>
          <AfterTaxBreakdown firstTotal={firstTotal} tax={c.tax} />
        </div>
      )}

      <div className="aggregates">
        {aggRows.map(([k, v]) => (
          <div key={k} className="a-row">
            <span className="k">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>

      <MortChart rows={c.rows} loan={c.loan} term={c.term} />

      <button className="toggle" onClick={() => setScheduleOpen((o) => !o)}>
        {scheduleOpen ? "hide schedule" : `show ${c.months}-month schedule`}
      </button>

      <MortSchedule rows={c.rows} open={scheduleOpen} />

      <div className="footer">
        P&amp;I via standard amortization. PMI assumed at 0.55%/yr of original loan, removed at 78% LTV.
        Property tax assumes constant assessment; in reality assessed value drifts with the market.
        Insurance and utilities held constant — they actually grow ~3%/yr.
        <br /><br />
        <strong>Tax model.</strong> Uses 2025 federal brackets and standard deductions (post-OBBBA) flat
        for all loan years. SALT cap follows the OBBBA schedule: $40k in 2025 stepping up 1%/yr through
        $41,624 in 2029, then reverting to $10k from 2030 onward; phase-down of 30% × MAGI excess
        above ~$500k (also indexed 1%/yr), floor $10k. Mortgage interest deductible on the first
        $750k of acquisition debt (proportional pro-ration for larger loans).
        Compares <em>itemizing with the home</em> against the better of <em>itemizing without the home
        or standard deduction</em>, year by year — this is the marginal benefit of buying vs renting,
        not the gross deduction value.
        <br /><br />
        Sources: 30-yr fixed rate from <a href="https://fred.stlouisfed.org/series/MORTGAGE30US">FRED MORTGAGE30US</a> (Freddie Mac PMMS).
        County list and median home value from <a href="https://www.census.gov/data/developers/data-sets/acs-5year.html">Census ACS 5-Year</a> (table B25077, vintage 2022).
        State-level effective property tax rates from Tax Foundation (2023). Homeowner's insurance averages from NAIC dwelling-fire/homeowners reports.
        Utility baselines from EIA residential averages. Federal brackets &amp; SALT schedule per
        <a href="https://www.congress.gov/bill/119th-congress/house-bill/1">OBBBA</a> (2025).
        Not financial advice. Get a real Loan Estimate and talk to a CPA before deciding anything.
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

function AfterTaxBreakdown({ firstTotal, tax }) {
  const yr1Monthly = tax.yr1Benefit / 12;
  const y0 = tax.yearly[0];
  const ySunset = tax.yearly.find((y) => y.year >= 2030) || tax.yearly[tax.yearly.length - 1];
  const yLast = tax.yearly[tax.yearly.length - 1];
  const itemizesNote = tax.yr1Itemizes ? "itemizes (year 1)" : "standard deduction wins (year 1)";

  const rows = [
    ["Pre-tax monthly", fmtMoney(firstTotal)],
    ["− Fed tax savings/mo (yr 1)", fmtMoney(yr1Monthly)],
    ["SALT cap (yr 1)", fmtMoney(tax.yr1Cap)],
    ["Position", itemizesNote],
    [`Tax benefit ${y0.year}`, fmtMoney(y0.benefit / 12) + "/mo"],
  ];
  if (ySunset && ySunset.year !== y0.year) {
    rows.push([`Tax benefit ${ySunset.year} (post-SALT sunset)`, fmtMoney(ySunset.benefit / 12) + "/mo"]);
  }
  if (yLast && yLast.year !== ySunset.year) {
    rows.push([`Tax benefit ${yLast.year}`, fmtMoney(yLast.benefit / 12) + "/mo"]);
  }
  return (
    <div className="breakdown">
      {rows.map(([k, v]) => (
        <div key={k} className="row">
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}
