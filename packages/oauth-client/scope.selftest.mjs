// scope.selftest — pins the per-site narrow-scope + incremental-escalation math in auth.js.
// The OAuth round-trip can't run in node, but the scope accounting (what's covered, what's
// missing, what an escalation requests) is pure — and it's the part that must be exactly right,
// or a write silently 403s (under-scope) or the consent screen stays scary (over-request).
import { AuthClient, scopeTokens, normalizeScopes, scopeCovers, missingScopes, unionScopes } from './auth.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}`);

// tokens
eq(scopeTokens('atproto  repo:com.a\nrepo:com.b'), ['atproto', 'repo:com.a', 'repo:com.b'], 'scopeTokens splits on any whitespace');
eq(scopeTokens(''), [], 'scopeTokens of empty');
eq(scopeTokens(null), [], 'scopeTokens of null');

// normalize — bare NSID → repo:, schemes kept, atproto kept
eq(normalizeScopes('com.minomobi.hoop.story.rumor'), ['repo:com.minomobi.hoop.story.rumor'], 'bare NSID → repo:');
eq(normalizeScopes(['atproto', 'com.a', 'blob:image/*', 'rpc:com.x', 'repo:com.b']),
   ['atproto', 'repo:com.a', 'blob:image/*', 'rpc:com.x', 'repo:com.b'], 'normalize keeps schemes + atproto, prefixes bare');

// covers — exact, and transition:generic / repo:* as repo wildcards
ok(scopeCovers('atproto repo:com.a', 'repo:com.a'), 'exact repo token covered');
ok(!scopeCovers('atproto repo:com.a', 'repo:com.b'), 'missing repo token not covered');
ok(scopeCovers('atproto transition:generic', 'repo:com.anything'), 'transition:generic covers any repo:');
ok(scopeCovers('atproto repo:*', 'repo:com.anything'), 'repo:* covers any repo:');
ok(!scopeCovers('atproto transition:generic', 'blob:image/*'), 'transition:generic does NOT cover blob:');
ok(scopeCovers('atproto blob:image/*', 'blob:image/*'), 'exact blob token covered');

// missing — the gap a site must escalate for
eq(missingScopes('atproto repo:com.a', ['atproto', 'repo:com.a', 'repo:com.b']), ['repo:com.b'], 'missing returns only the uncovered');
eq(missingScopes('atproto transition:generic', ['repo:com.a', 'repo:com.b']), [], 'wildcard session misses nothing repo-shaped');
eq(missingScopes('atproto repo:com.hoop.a', 'com.hoop.a'), [], 'bare-NSID required, already held');

// union — additive escalation never drops a held grant, and dedups
eq(unionScopes('atproto repo:com.a', ['repo:com.b']).split(' ').sort(),
   ['atproto', 'repo:com.a', 'repo:com.b'].sort(), 'union adds the new, keeps the old');
eq(unionScopes('atproto repo:com.a', ['repo:com.a']).split(' ').sort(),
   ['atproto', 'repo:com.a'].sort(), 'union dedups');

// hasScope / ensureScope on a client with a stubbed login (no browser)
const HOOP = 'atproto repo:com.minomobi.hoop.story.save repo:com.minomobi.hoop.story.rumor';
{
  const a = new AuthClient();
  a._user = null;
  ok(a.hasScope(HOOP) === false, 'hasScope false when signed out');
  let loginCall = null; a.login = async (h, o) => { loginCall = { h, o }; };
  ok((await a.ensureScope(HOOP)) === false && loginCall === null, 'ensureScope no-ops (returns false) when signed out');
}
{
  const a = new AuthClient();
  a._user = { handle: 'alice.test', scope: 'atproto transition:generic' };   // a legacy UNIFIED/generic session
  ok(a.hasScope(HOOP) === true, 'hasScope true when the session already covers it (generic)');
  let loginCall = null; a.login = async (h, o) => { loginCall = { h, o }; };
  ok((await a.ensureScope(HOOP)) === true && loginCall === null, 'ensureScope no-ops when already covered');
}
{
  const a = new AuthClient();
  a._user = { handle: 'bob.test', scope: 'atproto repo:com.minomobi.hoop.story.save' };   // identity + partial
  ok(a.hasScope(HOOP) === false, 'hasScope false when a required collection is missing');
  let loginCall = null; a.login = async (h, o) => { loginCall = { h, o }; };
  const r = await a.ensureScope(HOOP);
  ok(r === false, 'ensureScope returns false (it redirected) when escalating');
  ok(loginCall && loginCall.h === 'bob.test', 'ensureScope escalates as the same user');
  const reqd = scopeTokens(loginCall.o.scope);
  ok(reqd.includes('repo:com.minomobi.hoop.story.save') && reqd.includes('repo:com.minomobi.hoop.story.rumor'),
    'escalation requests the UNION (keeps held save, adds missing rumor)');
}

console.log(`scope.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
