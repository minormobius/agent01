// node scripts/lab-content-gate.selftest.mjs
//
// The gate this exercises has one job: refuse a lab site that republishes other
// people's media from an unbounded stream. Until this file existed, that claim
// had never been tested against a build that actually tries — the containment
// gate in lab-build.yml had produced one false positive and several clean
// passes, which is not evidence of enforcement.
//
// So every case below is written as the AGENT would write it, from the request
// that killed the bot this project is modelled on: "pull cat images from the
// firehose". The last two are the control — legitimate sites must still pass, or
// the gate is just a ban on being interesting.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const GATE = new URL('./lab-content-gate.mjs', import.meta.url).pathname;
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

/** Run the gate over a throwaway tenant dir. Returns { ok, out }. */
function gate(files) {
  const dir = mkdtempSync(join(tmpdir(), 'labgate-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      const p = join(dir, name);
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, body);
    }
    try {
      const out = execFileSync('node', [GATE, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const BRIEF = 'BRIEF.md';
const brief = '# test\n\nA test fixture.\n';

/** The meta every page must now carry. Kept out of the fixtures' way so each
 *  case still reads as the one thing it is testing. */
const META = `<title>t</title>
<meta property="og:title" content="t">
<meta property="og:description" content="d">`;

console.log('— the request that killed the other bot —');
{
  // Verbatim shape of cat/worker.js, ported to the browser. This is the one an
  // agent lands on if it greps the repo for "firehose", which it can.
  const r = gate({
    'index.html': `<!doctype html>${META}<title>cats</title><script>
      const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post');
      ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        const img = d.commit?.record?.embed?.images?.[0];
        if (img) document.body.innerHTML += '<img src="https://cdn.bsky.app/img/feed_thumbnail/plain/' + d.did + '/' + img.image.ref.$link + '@jpeg">';
      };
    </script>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'browser Jetstream subscription is REJECTED');
  ck(/jetstream/i.test(r.out), 'the error names jetstream');
  ck(/takedown/i.test(r.out), 'the error explains why, not just that');
}

console.log('— the same idea without any banned word —');
{
  // No socket, no "firehose", no jetstream. Just the AppView's search endpoint,
  // polled. This is the case a string blocklist misses entirely, and the reason
  // the gate is an allowlist of methods rather than a list of bad words.
  const r = gate({
    'index.html': `<!doctype html>${META}<title>cats</title><script>
      async function tick() {
        const d = await kit.fetchJson('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=%23cats');
        for (const p of d.posts) render(p);
      }
      setInterval(tick, 5000);
    </script>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'polling searchPosts is REJECTED — no banned string appears in it');
  ck(/searchPosts/.test(r.out), 'the error names the method');
  ck(/subject the visitor named/i.test(r.out), 'the error states the rule it broke');
}

console.log('— going around the AppView to the PDS —');
{
  const r = gate({
    'index.html': `<!doctype html>${META}<script>
      fetch('https://morel.us-east.host.bsky.network/xrpc/com.atproto.sync.getBlob?did=' + did + '&cid=' + cid);
    </script>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'com.atproto.sync.getBlob is REJECTED');
  ck(/moderation/i.test(r.out), 'the error says why the PDS path is worse than the AppView path');
}

console.log('— persistence on a shared origin —');
{
  const r = gate({
    'index.html': `<!doctype html>${META}<script>navigator.serviceWorker.register('./sw.js');</script>`,
    'sw.js': `self.addEventListener('fetch', () => {});`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'registering a service worker is REJECTED');
  ck(/SHARED origin/i.test(r.out), 'the error explains the shared-origin stake');
}

console.log('— the feed generator dodge —');
{
  const r = gate({
    'index.html': `<!doctype html>${META}<script>
      kit.fetchJson('https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=at://did:plc:x/app.bsky.feed.generator/cats');
    </script>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'getFeed is REJECTED — a feed generator is still a stream nobody named');
}

console.log('— CONTROL: legitimate sites must still pass —');
{
  // A handle resolver: the visitor types the subject. This is the shape of
  // lab/www/handle, which is a real shipped tenant.
  const r = gate({
    'index.html': `<!doctype html>${META}<script>
      const d = await kit.fetchJson('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=' + h);
      const p = await kit.fetchJson('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + d.did);
      img.src = p.avatar;
    </script>`,
    [BRIEF]: brief,
  });
  ck(r.ok, 'resolveHandle + getProfile for a handle the visitor typed PASSES');
}
{
  // Showing one account's posts, including their images, where the visitor
  // named the account. Bounded, chosen, and the whole point of the exercise.
  const r = gate({
    'index.html': `<!doctype html>${META}<script>
      kit.fetchJson('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=' + who);
    </script>`,
    [BRIEF]: brief,
  });
  ck(r.ok, 'getAuthorFeed for an actor the visitor named PASSES');
}
{
  // A record TYPE is not a method call. app.bsky.feed.post appears in almost any
  // page that touches ATProto data; treating it as a call would fail everything.
  const r = gate({
    'index.html': `<!doctype html>${META}<script>
      if (rec.$type === 'app.bsky.feed.post' && rec.embed?.$type === 'app.bsky.embed.images') show(rec);
    </script>`,
    [BRIEF]: brief,
  });
  ck(r.ok, 'lexicon names used as record types do not trip the method allowlist');
}

console.log('— BRIEF.md is prose, not code —');
{
  // The brief is written for the next run and should be able to say "this
  // deliberately does not use the firehose" without failing the build for it.
  const r = gate({
    'index.html': `<!doctype html>${META}<p>hello`,
    [BRIEF]: '# notes\n\nDeliberately avoids jetstream and any wss:// stream.\n',
  });
  ck(r.ok, 'the word jetstream in BRIEF.md does not fail the build');
}

console.log('— a broken page is a warning, not a failure —');
{
  const r = gate({
    'index.html': `<!doctype html>${META}<script>fetch('https://example.com/data.json');</script>`,
    [BRIEF]: brief,
  });
  ck(r.ok, 'fetching a host the CSP blocks still publishes');
  ck(/connect-src/.test(r.out), 'but warns that the request will fail in the browser');
}


console.log('— credential collection —');
{
  const r = gate({
    'index.html': `<!doctype html>${META}<form><input type="password" name="pw"></form>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'a password field is REJECTED');
  ck(/Bluesky OAuth/.test(r.out), 'the error says what the only permitted login is');
}
{
  const r = gate({
    'index.html': `<!doctype html>${META}<script>await window.ethereum.request({method:'eth_requestAccounts'})</script>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'an Ethereum provider is REJECTED');
}
{
  const r = gate({
    'index.html': `<!doctype html>${META}<script src="x"></script><script>const w = new WalletConnect()</script>`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'WalletConnect is REJECTED');
}
{
  const r = gate({
    'index.html': `<!doctype html>${META}<input autocomplete="cc-number">`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'a card number field is REJECTED');
}

console.log('— but the JOKE page must build —');
{
  // The policy is "do not build the crypto site, build a page mocking whoever
  // asked". That page necessarily talks ABOUT crypto and wallets. If the gate
  // matched on topic instead of machinery, the sanctioned response would be
  // unbuildable — which would quietly turn the joke into an error message.
  const r = gate({
    'index.html': `<!doctype html>${META}
      <h1>you asked for a crypto site</h1>
      <p>so here is a wallet, a blockchain, and a token — all of them imaginary,
         much like the returns. seed phrase not required, because we would never.</p>
      <script>const id = crypto.randomUUID(); document.title = 'gm ' + id.slice(0,4);</script>`,
    [BRIEF]: brief,
  });
  ck(r.ok, 'a page that MOCKS crypto passes — the gate matches machinery, not topic');
  ck(!/crypto\.randomUUID/.test(r.out), 'Web Crypto is not mistaken for a wallet');
}

console.log('— the link card —');
{
  const r = gate({
    'index.html': `<!doctype html><title>only a title</title><p>hi`,
    [BRIEF]: brief,
  });
  ck(!r.ok, 'missing og:title / og:description is REJECTED');
  ck(/link card/.test(r.out), 'the error explains it is about the Bluesky post, not SEO');
}
{
  const r = gate({
    'index.html': `<!doctype html>${META}<p>hi`,
    [BRIEF]: brief,
  });
  ck(r.ok, 'title + og:title + og:description passes');
}

// From Rob's no-build list, "spam or notification-abuse tools" — the one
// permission our Permissions-Policy header does not pin to (), on an origin
// every tenant shares.
console.log('— a tenant may not spend the shared origin\'s notification permission —');
{
  const r = gate({ 'index.html': `<!doctype html>${META}<script>
    Notification.requestPermission().then(p => console.log(p));
  </script>` });
  ck(!r.ok, 'REJECTED — Notification.requestPermission');
  ck(/per-ORIGIN|origin is shared/.test(r.out), 'says WHY: the permission belongs to the domain, not the tenant');
}
{
  const r = gate({ 'index.html': `<!doctype html>${META}<p>An article about how browser
    notifications work, mentioning notifications and permission prompts in prose.</p>` });
  ck(r.ok, 'CONTROL: writing ABOUT notifications passes — machinery, not topic');
}
// Enabling 'wasm-unsafe-eval' made this necessary: the gate reads SOURCE, so a
// binary in a tenant directory used to be filtered out and shipped unread. That
// was survivable only while nothing but JS could execute.
console.log('— a tenant may not ship bytes the gate cannot read —');
{
  const r = gate({ 'index.html': `<!doctype html>${META}<p>hi</p>`,
                   'mystery.wasm': 'AGFzbQEAAAA=' });
  ck(!r.ok, 'REJECTED — an unreviewable file in the tenant directory');
  ck(/lab\/_kit|reviewable/.test(r.out), 'points at lab/_kit/ as where shared binaries belong');
}
{
  const r = gate({ 'index.html': `<!doctype html>${META}<img src="./shot.png">`,
                   'shot.png': 'not really a png but inert' });
  ck(r.ok, 'CONTROL: an image passes — inert data governed by img-src');
}

// A DELIBERATE POLICY WIDENING (2026-07-27), and the risk in a carve-out is
// that it is wider than intended. getRepo takes a DID the visitor named and
// returns one account's repo; getBlob and subscribeRepos must stay banned, and
// they live behind the same `com.atproto.sync.` prefix that now has a hole in
// it. Both directions asserted, because only testing the permit would let the
// hole grow silently.
console.log('— sync.getRepo is allowed; the rest of sync.* is not —');
{
  const r = gate({ 'index.html': `<!doctype html>${META}<script>
    const did = await resolve(handleTypedByVisitor);
    const car = await fetch(pds + '/xrpc/com.atproto.sync.getRepo?did=' + did);
  </script>` });
  ck(r.ok, 'a repo analyser using com.atproto.sync.getRepo PASSES');
}
for (const [method, label] of [
  ['com.atproto.sync.getBlob', 'getBlob — raw media, unfiltered'],
  ['com.atproto.sync.subscribeRepos', 'subscribeRepos — the firehose itself'],
  ['com.atproto.sync.getLatestCommit', 'getLatestCommit — not carved out'],
]) {
  const r = gate({ 'index.html': `<!doctype html>${META}<script>fetch('/xrpc/${method}');</script>` });
  ck(!r.ok, `still REJECTED: ${label}`);
}
{
  // The carve-out is implemented by blanking the allowed method before the
  // substring scan. A file using both must still be caught on the bad one.
  const r = gate({ 'index.html': `<!doctype html>${META}<script>
    fetch(pds + '/xrpc/com.atproto.sync.getRepo?did=' + did);
    fetch(pds + '/xrpc/com.atproto.sync.getBlob?cid=' + cid);
  </script>` });
  ck(!r.ok, 'a file using BOTH is still rejected for the banned one');
}

// ---------------------------------------------------------------------------
// THE NAME, NOT THE GAME.
//
// Written from what actually shipped: minomobi.com/tube-tetris/, with the mark
// in the slug, the title, the og:title, a heading, and painted onto the share
// card. Five surfaces, and the gate has to see all five — the canvas one
// especially, because that is the image that gets posted to Bluesky and it is
// a JS string literal, not markup.
//
// The controls at the end are the point of the whole check: the DESCRIPTION may
// say what the thing is like, and a game with its own name passes untouched.
// A rule that banned the comparison too would just produce worse link cards.

/** Same as gate(), but the tenant directory has a name we choose — the slug is
 *  the permanent URL, so it is one of the surfaces under test. */
function gateNamed(name, files) {
  const parent = mkdtempSync(join(tmpdir(), 'labgate-'));
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  try {
    for (const [f, body] of Object.entries(files)) {
      const p = join(dir, f);
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, body);
    }
    try {
      const out = execFileSync('node', [GATE, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
    }
  } finally { rmSync(parent, { recursive: true, force: true }); }
}

console.log('\n— the name, not the game —');
{
  const r = gateNamed('tube-tetris', { [BRIEF]: brief, 'index.html': `<!doctype html>${META}<h2>a game</h2>` });
  ck(!r.ok, 'the SLUG is rejected — a hyphen must not hide the mark');
  ck(/tube-tetris/.test(r.out), '  and the message names the slug');
}
for (const [what, html] of [
  ['<title>', '<title>tube tetris</title><meta property="og:title" content="t"><meta property="og:description" content="d">'],
  ['og:title', `${META}<meta property="og:title" content="Tube Tetris">`],
  ['a heading', `${META}<h2 id="center-title">tube tetris</h2>`],
]) {
  const r = gateNamed('tube-stacker', { [BRIEF]: brief, 'index.html': `<!doctype html>${html}` });
  ck(!r.ok, `the mark in ${what} is rejected`);
}
{
  // The share card is a canvas, so the name lives in a JS string literal. This
  // is the surface that actually gets posted, and the one a markup-only check
  // would sail straight past.
  const r = gateNamed('tube-stacker', {
    [BRIEF]: brief,
    'index.html': `<!doctype html>${META}<script>ctx.fillText('TUBE TETRIS', W / 2, 90);</script>`,
  });
  ck(!r.ok, 'the mark painted onto the SHARE CARD is rejected');
}
{
  const r = gateNamed('pac-man-clone', { [BRIEF]: brief, 'index.html': `<!doctype html>${META}` });
  ck(!r.ok, 'a hyphenated mark in the slug is rejected too');
}

console.log('— and the controls: comparison is fine, invention is fine —');
{
  // Nominative reference in the DESCRIPTION. This is honest, it is the clearest
  // possible link card, and banning it would make every card worse.
  const r = gateNamed('tube-stacker', {
    [BRIEF]: brief,
    'index.html': `<!doctype html><title>tube stacker</title>
<meta property="og:title" content="tube stacker">
<meta property="og:description" content="Tetris wrapped around a 3D cylinder — clear a full ring to score.">
<h2>tube stacker</h2><p>Inspired by Tetris, built from scratch.</p>`,
  });
  ck(r.ok, 'saying what it is LIKE, in the description and the body, passes');
}
{
  const r = gateNamed('turn-venn', {
    [BRIEF]: brief,
    'index.html': `<!doctype html>${META}<h1>turn venn</h1><script>ctx.fillText('TURN VENN', 10, 10);</script>`,
  });
  ck(r.ok, 'a site with a name of its own passes untouched');
}
{
  // Generic English words that are also marks are deliberately NOT on the list.
  // Matching them would misfire constantly and teach agents to route around the
  // gate instead of reading it.
  const r = gateNamed('doom-scroll', { [BRIEF]: brief, 'index.html': `<!doctype html>${META}<h1>sonic boom</h1>` });
  ck(r.ok, 'generic words that happen to be marks do not misfire');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
