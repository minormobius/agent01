import { createContext, useContext, useState, useEffect, useCallback } from "react";

// Single shared profile that every planning tool reads from and writes to.
// localStorage-backed for now; PDS-encrypted sync (via packages/atproto/crypto.js)
// is the planned follow-up so the same profile follows you across devices
// without trusting any server.

const STORAGE_KEY = "minomobi.finance.profile.v1";
const LEGACY_NETWORTH_KEY = "minomobi.finance.networth.v1";

export const DEFAULT_PROFILE = {
  version: 1,
  household: {
    filing: "single",          // 'single' | 'mfj' | 'hoh' | 'mfs'
    stateFips: null,           // e.g. '06' for California
    dependents: 0,
    currentAge: null,
  },
  accounts: [],                // [{ id, name, type, balance, addedAt }]
  income: {
    salary: 0,
    bonus: 0,
    rsuValue: 0,               // annualized $ value of RSU vests
    otherIncome: 0,
    pretax: { k401: 0, hsa: 0, health: 0, other: 0 },
    postTaxSavings: { roth: 0, brokerage: 0, other: 0 },
    stateIncTax: null,         // override; null = auto-estimate
    stateIncTaxAuto: true,
    magi: null,                // legacy alias for AGI; still used by /mort
    socialSecurity: {          // populated by /retire
      benefitAtFRA: null,      // user's estimated annual SS benefit at FRA (today's $)
      claimAge: 67,
      partnerBenefitAtFRA: null,
      partnerClaimAge: 67,
    },
  },
  expenses: {
    fixedMonthly: 0,
    variableMonthly: 0,
  },
  assumptions: {
    realReturn: 0.05,
    inflation: 0.025,
    retireAge: 65,
    endAge: 95,
    targetSpend: 100000,       // annual real $ spending target in retirement
    employerMatch: 0,          // annual employer 401k match (-> traditional)
    taxableBasisFrac: 0.6,     // share of taxable that's basis (not gain)
  },
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return mergeDefaults(parsed);
    }
  } catch { /* fall through to migration */ }

  // One-shot migration from the older networth-only storage shape
  try {
    const legacy = localStorage.getItem(LEGACY_NETWORTH_KEY);
    if (legacy) {
      const accounts = JSON.parse(legacy);
      if (Array.isArray(accounts)) {
        const migrated = { ...DEFAULT_PROFILE, accounts };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch { /* nothing to migrate */ }

  return DEFAULT_PROFILE;
}

function mergeDefaults(p) {
  const income = p.income || {};
  return {
    ...DEFAULT_PROFILE,
    ...p,
    household: { ...DEFAULT_PROFILE.household, ...(p.household || {}) },
    income: {
      ...DEFAULT_PROFILE.income,
      ...income,
      pretax: { ...DEFAULT_PROFILE.income.pretax, ...(income.pretax || {}) },
      postTaxSavings: { ...DEFAULT_PROFILE.income.postTaxSavings, ...(income.postTaxSavings || {}) },
      socialSecurity: { ...DEFAULT_PROFILE.income.socialSecurity, ...(income.socialSecurity || {}) },
    },
    expenses: { ...DEFAULT_PROFILE.expenses, ...(p.expenses || {}) },
    assumptions: { ...DEFAULT_PROFILE.assumptions, ...(p.assumptions || {}) },
    accounts: Array.isArray(p.accounts) ? p.accounts : [],
  };
}

function saveProfile(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
  catch { /* quota exceeded — silently drop, profile lives in memory */ }
}

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(loadProfile);

  useEffect(() => { saveProfile(profile); }, [profile]);

  const update = useCallback((patch) => {
    setProfile((p) => {
      const next = typeof patch === "function" ? patch(p) : { ...p, ...patch };
      return next;
    });
  }, []);

  const reset = useCallback(() => setProfile(DEFAULT_PROFILE), []);

  return (
    <ProfileContext.Provider value={{ profile, update, reset }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
