/**
 * The share scopes, and the rules that decide whether they were granted.
 * Each case below is a way the page could loop, or could post without asking.
 *
 *   node bsky/dweet/scopes.selftest.mjs
 */
import {
  STILL_SCOPES, VIDEO_SCOPES, parseScope, tokenCovers, missing, beyondCeiling,
  recentlyEscalated, markEscalated, clearEscalated, pdsAudience,
} from './scopes.js';

let fails = 0;
const ok = (msg, cond) => { if (cond) console.log(`  ✓ ${msg}`); else { fails++; console.log(`  ✗ ${msg}`); } };

console.log('the scopes asked for are grantable');
for (const t of VIDEO_SCOPES.filter((s) => s.startsWith('rpc'))) {
  const p = parseScope(t);
  ok(`${t} has an aud (the parser returns null without one)`, !!p.params.get('aud'));
  ok(`${t} is not the forbidden rpc:*?aud=*`, !(p.positional === '*' && p.params.get('aud') === '*'));
}
ok('nothing asks for rpc:com.atproto.server.getServiceAuth — the ungrantable token that looped',
  !VIDEO_SCOPES.some((s) => s.includes('server.getServiceAuth')));

console.log('coverage is semantic, not a string compare');
ok('identical strings', tokenCovers('blob:image/*', 'blob:image/*'));
ok('a blob accept list covers one of its types', tokenCovers('blob?accept=image/*&accept=video/*', 'blob:image/*'));
ok('*/* covers image/*', tokenCovers('blob:*/*', 'blob:image/*'));
ok('video/* does NOT cover image/*', !tokenCovers('blob:video/*', 'blob:image/*'));
ok('a merged lxm list covers each method',
  tokenCovers('rpc?aud=*&lxm=app.bsky.video.getUploadLimits&lxm=com.atproto.repo.uploadBlob', 'rpc:com.atproto.repo.uploadBlob?aud=*'));
ok('an rpc grant for one audience does NOT cover aud=*',
  !tokenCovers('rpc:com.atproto.repo.uploadBlob?aud=did:web:x.example%23svc', 'rpc:com.atproto.repo.uploadBlob?aud=*'));
ok('an rpc grant without aud covers nothing (it was never valid)',
  !tokenCovers('rpc:com.atproto.server.getServiceAuth', 'rpc:com.atproto.repo.uploadBlob?aud=*'));
ok('repo with the default actions covers a plain repo token', tokenCovers('repo:app.bsky.feed.post', 'repo:app.bsky.feed.post'));
ok('repo create-only does NOT cover a plain repo token (which means all three actions)',
  !tokenCovers('repo:app.bsky.feed.post?action=create', 'repo:app.bsky.feed.post'));
ok('repo:* covers any collection', tokenCovers('repo:*', 'repo:app.bsky.feed.post'));
ok('transition:generic covers repo, blob and rpc', ['repo:app.bsky.feed.post', 'blob:image/*', 'rpc:com.atproto.repo.uploadBlob?aud=*']
  .every((r) => tokenCovers('transition:generic', r)));
ok('…but not chat', !tokenCovers('transition:generic', 'rpc:chat.bsky.convo.getLog?aud=*'));

console.log('missing()');
const grant = 'atproto repo:com.minomobi.dweet.dweet repo:app.bsky.feed.post blob:image/*';
ok('a still is covered by the grant a still gets', missing(grant, STILL_SCOPES).length === 0);
ok('a moving post names exactly the two rpc tokens it lacks',
  JSON.stringify(missing(grant, VIDEO_SCOPES)) === JSON.stringify(VIDEO_SCOPES.slice(2)));
ok('the grant that looped still reads as missing (so the guard, not a retry, must answer)',
  missing(`${grant} rpc:com.atproto.server.getServiceAuth`, VIDEO_SCOPES).length === 2);

console.log('the ceiling is a string compare');
const ceiling = 'atproto transition:generic repo:app.bsky.feed.post blob:image/* blob:video/* rpc:com.atproto.server.getServiceAuth';
ok('a still fits the live ceiling', beyondCeiling(ceiling, STILL_SCOPES).length === 0);
ok('a moving post does not, until the auth worker lists the rpc tokens', beyondCeiling(ceiling, VIDEO_SCOPES).length === 2);
ok('…and does once it does', beyondCeiling(`${ceiling} ${VIDEO_SCOPES.slice(2).join(' ')}`, VIDEO_SCOPES).length === 0);

console.log('the loop breaker');
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
ok('nothing recorded: not escalated', !recentlyEscalated(store, VIDEO_SCOPES, 1000));
markEscalated(store, VIDEO_SCOPES, 1000);
ok('just escalated for this need: yes', recentlyEscalated(store, VIDEO_SCOPES, 2000));
ok('a DIFFERENT need is not blocked by it', !recentlyEscalated(store, STILL_SCOPES, 2000));
ok('the window expires', !recentlyEscalated(store, VIDEO_SCOPES, 1000 + 11 * 60 * 1000));
clearEscalated(store);
ok('cleared', !recentlyEscalated(store, VIDEO_SCOPES, 2000));
const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
ok('storage that throws reads as not-escalated rather than crashing', recentlyEscalated(broken, VIDEO_SCOPES) === false);
markEscalated(broken, VIDEO_SCOPES); clearEscalated(broken);
ok('…and writing to it does not throw', true);

console.log('audience');
ok('the uploadBlob audience is the PDS host as did:web',
  pdsAudience('https://chalciporus.us-west.host.bsky.network') === 'did:web:chalciporus.us-west.host.bsky.network');

if (fails) { console.log(`\nscopes.selftest: ${fails} FAILED`); process.exit(1); }
console.log('\nscopes.selftest: all passed');
