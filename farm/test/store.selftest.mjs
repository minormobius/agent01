// store.selftest.mjs — the sync layer's node-testable surface. Run: node farm/test/store.selftest.mjs
// (The flush loop itself is browser behavior; what we pin here is the error CLASSIFICATION that
// decides retry-with-backoff vs stop-and-ask-for-consent, and the login scope contract.)
import { FarmStore, SCOPE, FARM_SCOPES, SHARE_SCOPE } from '../js/store.js';

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

// posting is part of the login scope from the start — the share button must never bounce a fresh
// login through a re-consent redirect.
ok(SCOPE.split(' ').includes(SHARE_SCOPE), 'login scope carries app.bsky.feed.post up front');
ok(SCOPE.split(' ')[0] === 'atproto', 'atproto base scope leads');
ok(FARM_SCOPES.length === 4 && FARM_SCOPES.every((s) => s.startsWith('repo:com.minomobi.farm.')), 'all four farm collections requested');

// scope errors are PERMANENT (stop, show the grant banner); network errors are TRANSIENT (backoff).
const scopeErrors = [
  'putRecord failed: invalid_scope',
  'putRecord failed: 403 Forbidden',
  'putRecord failed: Bad token scope',
  'putRecord failed: not authorized to write com.minomobi.farm.plot',
  'Unauthorized',
];
const transientErrors = [
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'putRecord failed: 500 upstream error',
  'putRecord failed: 502 Bad Gateway',
  'The operation timed out',
];
for (const m of scopeErrors) ok(FarmStore.isScopeError(new Error(m)), 'permanent: ' + m);
for (const m of transientErrors) ok(!FarmStore.isScopeError(new Error(m)), 'transient: ' + m);

console.log(`store.selftest: ${n} assertions passed`);
