import { useState } from "react";
import SiteHeader from "../components/SiteHeader";
import Link from "../components/Link";
import { useProfile } from "../state/profile";

const TYPE_DEF = {
  cash: {
    label: "Cash & equivalents",
    note: "Checking, savings, money market, T-bills. Interest taxed as ordinary income.",
    color: "var(--c-cash)",
    sign: +1,
  },
  taxable: {
    label: "Taxable brokerage",
    note: "Stocks, bonds, ETFs in a non-retirement account. LTCG / qualified-dividend rates apply on realization.",
    color: "var(--c-taxable)",
    sign: +1,
  },
  traditional: {
    label: "Tax-deferred",
    note: "401k, 403b, traditional IRA. Grows tax-deferred; ordinary income on withdrawal; RMDs starting age 73.",
    color: "var(--c-traditional)",
    sign: +1,
  },
  roth: {
    label: "Tax-free (Roth)",
    note: "Roth IRA / Roth 401k. Already taxed; growth and qualified withdrawals are tax-free; no RMDs (Roth IRA).",
    color: "var(--c-roth)",
    sign: +1,
  },
  hsa: {
    label: "HSA",
    note: "Triple-advantaged for qualified medical: deductible in, tax-free growth, tax-free out. After 65, withdrawals for non-medical taxed like a traditional IRA.",
    color: "var(--c-hsa)",
    sign: +1,
  },
  realestate: {
    label: "Real estate",
    note: "Primary residence, rentals, REITs held in taxable. Appreciation deferred until sale; primary-residence §121 exclusion of up to $250k/$500k of gain.",
    color: "var(--c-realestate)",
    sign: +1,
  },
  equity: {
    label: "Equity comp",
    note: "Vested-but-unsold RSUs (already W-2 income; basis = vest price). Unexercised ISO/NSO have no basis until exercise. Concentration risk lives here.",
    color: "var(--c-equity)",
    sign: +1,
  },
  debt: {
    label: "Debt",
    note: "Mortgage, student loans, car loans, credit card balances. Subtracts from net worth.",
    color: "var(--c-debt)",
    sign: -1,
  },
};

const TYPE_ORDER = ["cash", "taxable", "traditional", "roth", "hsa", "realestate", "equity", "debt"];

function fmtMoney(v, decimals = 0) {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (v < 0 ? "-$" : "$") + abs;
}

function newId() {
  return "a_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function Networth() {
  const { profile, update } = useProfile();
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [balance, setBalance] = useState("");

  const accounts = profile.accounts || [];

  const addAccount = () => {
    const bal = parseFloat(balance);
    if (!name.trim() || !TYPE_DEF[type] || !isFinite(bal)) return;
    const acct = { id: newId(), name: name.trim(), type, balance: bal, addedAt: Date.now() };
    update((p) => ({ ...p, accounts: [...(p.accounts || []), acct] }));
    setName("");
    setBalance("");
  };

  const removeAccount = (id) => {
    update((p) => ({ ...p, accounts: (p.accounts || []).filter((a) => a.id !== id) }));
  };

  const handleKey = (e) => { if (e.key === "Enter") addAccount(); };

  // Aggregate by type
  const byType = {};
  for (const t of TYPE_ORDER) byType[t] = { accounts: [], total: 0 };
  for (const a of accounts) {
    if (!byType[a.type]) continue;
    byType[a.type].accounts.push(a);
    byType[a.type].total += a.balance;
  }

  const netWorth = TYPE_ORDER.reduce((s, t) => s + byType[t].total * TYPE_DEF[t].sign, 0);
  const totalAssets = TYPE_ORDER
    .filter((t) => TYPE_DEF[t].sign > 0)
    .reduce((s, t) => s + byType[t].total, 0);

  return (
    <div className="page">
      <SiteHeader section="networth" />
      <p className="subtitle">net worth statement</p>
      <p className="desc">
        enter your accounts. group by how each one is taxed — that's where most planning
        decisions actually live. stored locally in your browser; nothing leaves this page.
      </p>

      <h2 className="section">add account</h2>
      <div className="add-form">
        <input
          type="text"
          placeholder="e.g. Vanguard brokerage"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKey}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>{TYPE_DEF[t].label}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          step="100"
          placeholder="balance ($)"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          onKeyDown={handleKey}
        />
        <button onClick={addAccount}>add</button>
      </div>

      <div className="summary">
        <div className="nw-total">
          <span className="lbl">net worth</span>
          <span className={`val${netWorth < 0 ? " neg" : ""}`}>{fmtMoney(netWorth)}</span>
        </div>
        <AllocationBar byType={byType} totalAssets={totalAssets} />
      </div>

      <div>
        {accounts.length === 0 ? (
          <p className="empty-msg">no accounts yet — add one above</p>
        ) : (
          TYPE_ORDER.map((t) => {
            const def = TYPE_DEF[t];
            const g = byType[t];
            if (g.accounts.length === 0) return null;
            const signed = g.total * def.sign;
            return (
              <section key={t} className="group">
                <header className="group-header">
                  <span className="name">
                    <span className="swatch" style={{ background: def.color }} />
                    {def.label}
                  </span>
                  <span className={`total${signed < 0 ? " neg" : ""}`}>{fmtMoney(signed)}</span>
                </header>
                <div className="group-tax-note">{def.note}</div>
                {g.accounts.map((a) => (
                  <div key={a.id} className="account">
                    <span className="acct-name">{a.name}</span>
                    <span className={`acct-balance${(a.balance * def.sign) < 0 ? " neg" : ""}`}>
                      {fmtMoney(a.balance * def.sign)}
                    </span>
                    <button className="danger" onClick={() => removeAccount(a.id)}>remove</button>
                  </div>
                ))}
              </section>
            );
          })
        )}
      </div>

      <div className="footer">
        Net worth = sum of asset accounts minus debts. Grouping by tax treatment matters for
        planning: a $100k traditional 401k and a $100k Roth IRA are not equivalent — the 401k
        will be taxed as ordinary income on withdrawal (and forced out via RMDs starting age 73),
        while the Roth is tax-free forever.
        <br /><br />
        Storage: <code>localStorage</code> only — your account list lives in this browser
        and nowhere else. PDS-encrypted sync is the planned follow-up so the same profile
        follows you across devices without trusting any server.
        <br /><br />
        See also <Link to="/mort">/mort</Link> (mortgage planner).
      </div>
    </div>
  );
}

function AllocationBar({ byType, totalAssets }) {
  if (totalAssets <= 0) {
    return (
      <>
        <div className="alloc-bar"></div>
        <div className="alloc-legend">
          <span style={{ color: "var(--muted)" }}>add some accounts to see allocation</span>
        </div>
      </>
    );
  }
  const segs = [];
  const legend = [];
  for (const t of TYPE_ORDER) {
    if (TYPE_DEF[t].sign < 0) continue;
    const v = byType[t].total;
    if (v <= 0) continue;
    const pct = (v / totalAssets) * 100;
    segs.push(
      <div
        key={t}
        className="seg"
        style={{ width: `${pct}%`, background: TYPE_DEF[t].color }}
        title={`${TYPE_DEF[t].label}: ${fmtMoney(v)} (${pct.toFixed(1)}%)`}
      />
    );
    legend.push(
      <span key={t}>
        <span className="swatch" style={{ background: TYPE_DEF[t].color }} />
        {TYPE_DEF[t].label}
        <span className="pct">{pct.toFixed(0)}%</span>
      </span>
    );
  }
  if (byType.debt.total > 0) {
    legend.push(
      <span key="debt">
        <span className="swatch" style={{ background: TYPE_DEF.debt.color }} />
        Debt {fmtMoney(byType.debt.total)} (deducted)
      </span>
    );
  }
  return (
    <>
      <div className="alloc-bar">{segs}</div>
      <div className="alloc-legend">{legend}</div>
    </>
  );
}
