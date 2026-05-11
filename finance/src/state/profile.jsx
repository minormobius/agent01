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
  },
  accounts: [],                // [{ id, name, type, balance, addedAt }]
  income: {},                  // { salary, bonus, rsuVests: [...] } — populated by /cashflow
  expenses: {},                // { fixed, variable } — populated by /cashflow
  assumptions: {               // baseline projection assumptions
    realReturn: 0.05,
    inflation: 0.025,
    retireAge: 65,
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
  return {
    ...DEFAULT_PROFILE,
    ...p,
    household: { ...DEFAULT_PROFILE.household, ...(p.household || {}) },
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
