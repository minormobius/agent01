/* node games/orb/test/orb.selftest.mjs
 *
 * Gates Orb. The load-bearing properties:
 *
 *   1. The mesh is a real spherical Voronoi diagram: Euler holds, adjacency is
 *      symmetric, and every cell's polygon closes around its own site. The
 *      torus meshes (js/torus.js) likewise: V−E+F = 0, cells tile the flat
 *      torus exactly, and the torus tiers' boards are proved like the sphere's.
 *   2. The solver is SOUND — it never calls a mine safe — and, at level 3,
 *      COMPLETE: it finds every cell that is certain. Both are checked against
 *      brute force over every mine layout on small meshes. Soundness is the
 *      game's whole promise ("no loss here needed a guess").
 *   3. Every generated board clears from its first click by deduction alone,
 *      deterministically, with the first cell and its neighbours clear.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadOrb, squareTorus } from "./harness.mjs";

const O = await loadOrb();
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

console.log("mesh");
for (const [n, relax] of [[12, 0], [60, 0], [300, 2], [600, 3]]) {
  const m = O.buildMesh("st" + n, n, relax);
  const sym = m.nbrs.every((ns, i) => ns.every((j) => m.nbrs[j].includes(i)));
  const edges = m.nbrs.reduce((a, b) => a + b.length, 0) / 2;
  const own = m.polys.every((ring, i) => {
    let x = 0, y = 0, z = 0;
    for (const f of ring) { x += m.verts[3 * f]; y += m.verts[3 * f + 1]; z += m.verts[3 * f + 2]; }
    const l = Math.hypot(x, y, z);
    return O.cellAt(m, x / l, y / l, z / l) === i;
  });
  ck(m.tris.length === 2 * n - 4 && edges === 3 * n - 6 && sym && own && m.polys.every((r, i) => r.length === m.nbrs[i].length && r.length >= 3),
    `n=${n} relax=${relax}: V−E+F=2 (${2 * n - 4} tris, ${edges} edges), symmetric, every ring closes on its own site`);
}

console.log("torus mesh");
for (const [kind, m] of [["hex 4×8", O.buildHexTorus(4, 8)], ["hex 8×16", O.buildHexTorus(8, 16)], ["voronoi 40", O.buildTorus("tt40", 40, 3)], ["voronoi 320", O.buildTorus("tt320", 320, 3)], ["voronoi 600", O.buildTorus("tt600", 600, 3)]]) {
  const n = m.n, nv = m.verts.length / 2, edges = m.nbrs.reduce((a, b) => a + b.length, 0) / 2;
  const sym = m.nbrs.every((ns, i) => ns.every((j) => m.nbrs[j].includes(i)) && new Set(ns).size === ns.length && !ns.includes(i));
  const inc = new Array(nv).fill(0); m.polys.forEach((r) => r.forEach((v) => inc[v]++));
  let area = 0, own = true;
  for (let i = 0; i < n; i++) {
    const r = O.torusRing(m, i); let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; A += a[0] * b[1] - b[0] * a[1]; cx += a[0]; cy += a[1]; }
    area += A / 2; if (A <= 0 || O.torusCellAt(m, cx / r.length, cy / r.length) !== i) own = false;
  }
  ck(nv - edges + n === 0 && nv === 2 * n && sym && inc.every((x) => x === 3) && m.polys.every((r, i) => r.length === m.nbrs[i].length),
    `${kind}: V−E+F=0 (${nv} corners, ${edges} edges, ${n} cells), every corner in three cells, adjacency symmetric`);
  ck(Math.abs(area - m.W * m.H) < 1e-9 * m.W * m.H && own, `${kind}: cells tile the flat torus exactly (area ${area.toFixed(6)}), each ring wound round its own site`);
}
{ const h = O.buildHexTorus(6, 12); ck(h.nbrs.every((ns) => ns.length === 6), "hex torus: every cell has exactly six neighbours"); }

console.log("solver vs brute force");
function brute(mesh, open, count, total) {
  const n = mesh.n, canMine = new Uint8Array(n), canSafe = new Uint8Array(n);
  let worlds = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let pc = 0; for (let b = mask; b; b &= b - 1) pc++;
    if (pc !== total) continue;
    let good = true;
    for (let i = 0; i < n && good; i++) {
      if (!open[i]) continue;
      if (mask >> i & 1) { good = false; break; }
      let c = 0; for (const j of mesh.nbrs[i]) c += mask >> j & 1;
      if (c !== count[i]) good = false;
    }
    if (!good) continue;
    worlds++;
    for (let i = 0; i < n; i++) (mask >> i & 1 ? canMine : canSafe)[i] = 1;
  }
  return { canMine, canSafe, worlds };
}
const small = [O.buildMesh("bf-a", 14, 0), O.buildMesh("bf-b", 16, 1), squareTorus(4, 4)];
let checked = 0, unsound = 0, incomplete = 0, partialUnsound = 0;
for (let t = 0; t < 400; t++) {
  const mesh = small[t % small.length], n = mesh.n, rng = O.rngFor("bf", t);
  const total = rng.int(2, 5);
  const mines = rng.shuffle([...Array(n).keys()]).slice(0, total);
  const s = O.newState(mesh, total); O.plant(s, mines);
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!s.mine[i] && rng.next() < 0.35) open[i] = 1;
  const truth = brute(mesh, open, s.count, total);
  const view = { n, nbrs: mesh.nbrs, open, count: s.count, known: new Uint8Array(n), total };
  const ex = O.deduce(view, { exactOnly: true });
  const exSafe = new Set(ex.safe), exMine = new Set(ex.mine);
  for (let i = 0; i < n; i++) {
    if (open[i]) continue;
    const certSafe = !truth.canMine[i], certMine = !truth.canSafe[i];
    if ((exSafe.has(i) && !certSafe) || (exMine.has(i) && !certMine)) unsound++;
    if ((certSafe && !exSafe.has(i)) || (certMine && !exMine.has(i))) incomplete++;
  }
  const quick = O.deduce(view); // levels 1–2 may stop early but must never lie
  for (const i of quick.safe) if (truth.canMine[i]) partialUnsound++;
  for (const i of quick.mine) if (truth.canSafe[i]) partialUnsound++;
  checked++;
}
ck(unsound === 0, `exact solver sound on ${checked} random views (${unsound} wrong calls)`);
ck(incomplete === 0, `exact solver complete — found every certain cell (${incomplete} missed)`);
ck(partialUnsound === 0, `levels 1–2 sound (${partialUnsound} wrong calls)`);

console.log("generator");
for (const [key, n, M] of Object.entries(O.SIZES).map(([k, c]) => [k, c.n, c.m])) {
  const mesh = O.meshFor(key, "gen-st");
  let all = true, clear = true, det = true;
  for (let t = 0; t < 12; t++) {
    const first = (t * 37) % n;
    const g = O.generate(mesh, M, first, "s" + t);
    const set = new Set(g.mines);
    if (set.size !== M) all = false;
    if (set.has(first) || mesh.nbrs[first].some((j) => set.has(j))) clear = false;
    if (!O.solveFrom(mesh, g.mines, first).solved) all = false;
    if (O.generate(mesh, M, first, "s" + t).mines.join() !== g.mines.join()) det = false;
  }
  ck(all, `${key} ${n}/${M}: 12 boards, each clears by deduction alone`);
  ck(clear && det, `${key} ${n}/${M}: first cell and neighbours clear; same (seed, click) → same board`);
}

console.log("always a certain cell");
{
  // Knowledge only grows: whatever safe cells a player opens, in any order and
  // however lucky, the solver's proof still applies, so some cell stays
  // certain until the board is cleared. The game's "guesses" readout depends
  // on this. Check it with a player who opens random safe cells (pure luck).
  let states = 0, empty = 0, short = 0, richer = 0, partial = 0;
  for (let t = 0; t < 8; t++) {
    const mesh = O.buildMesh("cert" + t, 200, 2), first = t * 11;
    const g = O.generate(mesh, 32, first, "c" + t);
    const s = O.newState(mesh, 32); O.plant(s, g.mines); s.phase = "play";
    O.reveal(s, first);
    const rng = O.rngFor("lucky", t);
    while (s.phase === "play") {
      states++;
      const cert = O.certainties(s);
      if (!cert.safe.length) empty++;
      // the guess counter's input must be the COMPLETE certain set, not just
      // whatever the cheapest rule found first
      const full = O.deduce({ n: s.n, nbrs: mesh.nbrs, open: s.open, count: s.count, known: new Uint8Array(s.n), total: 32 }, { exactOnly: true });
      if (cert.partial) partial++; else if (!full.exhausted && cert.safe.length !== full.safe.length) short++;
      const quick = O.deduce({ n: s.n, nbrs: mesh.nbrs, open: s.open, count: s.count, known: new Uint8Array(s.n), total: 32 });
      if (quick.safe.length < full.safe.length) richer++;
      const closed = []; for (let i = 0; i < s.n; i++) if (!s.open[i] && !s.mine[i]) closed.push(i);
      O.reveal(s, rng.pick(closed));
    }
  }
  ck(empty === 0, `${states} positions reached by a lucky player: every one has a certain cell (${empty} without)`);
  ck(short === 0 && partial === 0 && richer > 0, `certainties() is the complete set in every position (${short} short, ${partial} out of budget; ${richer} positions where the first-level answer alone would have miscalled a safe tap as a guess)`);
}

console.log("rules");
{
  const mesh = O.buildMesh("rules", 80, 2);
  const g = O.generate(mesh, 10, 0, "r");
  const s = O.newState(mesh, 10); O.plant(s, g.mines); s.phase = "play";
  const opened = O.reveal(s, 0);
  ck(s.count[0] === 0 && opened.length > mesh.nbrs[0].length, `first click floods (${opened.length} cells)`);
  ck(opened.every((i) => !s.mine[i]), "flood opens no mine");
  const r = O.solveFrom(mesh, g.mines, 0);
  ck(r.state.phase === "won" && r.state.opened === 70, "solving out the board wins it");
  const boom = g.mines[0];
  O.reveal(s, boom);
  ck(s.phase === "lost" && s.boom === boom, "opening a mine loses");
}

console.log("hard mode");
{
  // hardSolve's count must match what the game sees: replay a careful player
  // (easy cells first) and ask hardNow() at every step, as main.js does.
  let agree = true, forged = true, det = true, clear = true, climbed = 0, boards = 0;
  for (const [n, M, steps] of [[160, 28, 150], [320, 62, 150]]) {
    const mesh = O.buildMesh("hard-st" + n, n, 2);
    for (let t = 0; t < 4; t++) {
      const first = (t * 41) % n;
      const g = O.generateHard(mesh, M, first, "h" + t, steps);
      boards++;
      if (g.hard > g.start) climbed++;
      const set = new Set(g.mines);
      if (set.size !== M || set.has(first) || mesh.nbrs[first].some((j) => set.has(j))) clear = false;
      if (!O.solveFrom(mesh, g.mines, first).solved) forged = false;
      if (O.generateHard(mesh, M, first, "h" + t, steps).mines.join() !== g.mines.join()) det = false;
      const s = O.newState(mesh, M); O.plant(s, g.mines); s.phase = "play"; O.reveal(s, first);
      let seen = 0;
      while (s.phase === "play") {
        let e = O.easySafe(s);
        if (!e.length) { if (!O.hardNow(s)) { agree = false; break; } seen++; e = O.certainties(s).safe; }
        else if (O.hardNow(s)) { agree = false; break; }
        e.forEach((x) => O.reveal(s, x));
      }
      if (seen !== g.hard || s.phase !== "won") agree = false;
    }
  }
  ck(forged && clear, `${boards} forged boards: every one still clears without a guess, first cell and neighbours clear`);
  ck(det, "forging is deterministic: same seed and first tap, same hard board");
  ck(agree, "hardNow() during play agrees with hardSolve()'s count on every board");
  ck(climbed >= boards / 2, `the climb adds hard moments (${climbed} of ${boards} boards ended harder than they started)`);
}

console.log("score corpus (fake network)");
{
  const { Corpus, accept } = await import(new URL("../js/corpus.js", import.meta.url));
  const now = Date.now(), iso = (dt) => new Date(now - dt).toISOString();
  const rec = (game, value, dt = 0, extra = {}) => ({ $type: "com.minomobi.lab.score", site: "orb", game, value, unit: "ms", higherIsBetter: false, createdAt: iso(dt), ...extra });
  const repos = {
    "did:plc:aaa": [rec("pure-320-62", 90000), rec("pure-320-62", 80000, 9 * 86400e3), rec("pure-160-28", 40000)],
    "did:plc:bbb": [rec("pure-320-62", 85000), { site: "ponderbrot", game: "ponderbrot", value: 667, unit: "x", createdAt: iso(0) }, rec("pure-320-62", 500)],
    "did:plc:gone": null,                                    // relay lists it, PDS doesn't have it
  };
  const page = (list, cursor) => {                         // two-page listRecords to exercise cursors
    const i = cursor ? +cursor : 0, slice = list.slice(i, i + 2);
    return { records: slice.map((v, k) => ({ uri: "at://x/" + (i + k), value: v })), cursor: i + 2 < list.length ? String(i + 2) : undefined };
  };
  globalThis.fetch = async (url) => {
    const u = new URL(url), j = (b, s = 200) => ({ ok: s === 200, status: s, json: async () => b });
    if (u.pathname.endsWith("listReposByCollection")) return j({ repos: Object.keys(repos).map((did) => ({ did })) });
    if (u.host === "plc.directory") return j({ service: [{ id: "#atproto_pds", serviceEndpoint: "https://pds.test" }], alsoKnownAs: ["at://claims-to-be.bsky.app"] });
    if (u.pathname.endsWith("listRecords")) {
      const list = repos[u.searchParams.get("repo")];
      if (!list) return j({ error: "RepoNotFound" }, 400);
      const p = page(list, u.searchParams.get("cursor"));
      p.records.forEach((r) => (r.uri = "at://" + u.searchParams.get("repo") + "/c/" + r.uri.split("/").pop()));
      return j(p);
    }
    if (u.pathname.endsWith("getProfiles")) {
      if (flaky-- > 0) return j({}, 502);                 // the appview has a bad moment
      return j({ profiles: u.searchParams.getAll("actors").map((did) => ({ did, handle: did === "did:plc:bbb" ? "handle.invalid" : did.slice(8) + ".test", avatar: "https://cdn.bsky.app/img/avatar/plain/" + did + "/x@jpeg" })) });
    }
    return j({}, 404);
  };
  let flaky = 0;
  let sock = null;
  globalThis.WebSocket = class { constructor(url) { this.url = url; sock = this; setTimeout(() => this.onopen && this.onopen(), 0); } close() {} };
  const c = new Corpus(accept);
  await c.start();
  await new Promise((r) => setTimeout(r, 5));
  const m = c.top("pure-320-62");
  ck(c.repos === 3 && c.records.size === 4, `backfill: 3 repos listed (two pages of records each), dead one skipped, 4 Orb records kept (${c.records.size}); other sites' and malformed ones dropped`);
  ck(m.length === 2 && m[0].did === "did:plc:aaa" && m[0].value === 80000 && m[1].value === 85000,
    `ranking: best time per player, lowest first (${m.map((r) => r.value).join(", ")}); the 0.5 s record is rejected`);
  ck(c.top("pure-320-62", now - 7 * 86400e3)[0].value === 85000, "period filter: this week drops the 9-day-old best");
  ck(m[0].handle === "aaa.test" && m[1].handle === null, "names: verified handle shown; unverified gets none, never the DID doc's claim");
  ck(m[0].avatar === "https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:aaa/x@jpeg", "avatars: from the appview, as the thumbnail size");
  ck(c.state === "live" && /wantedCollections=com\.minomobi\.lab\.score&cursor=\d+/.test(sock.url), "Jetstream: filtered to the collection, with a cursor from before the backfill");
  sock.onmessage({ data: JSON.stringify({ did: "did:plc:ccc", time_us: 1, kind: "identity" }) });
  sock.onmessage({ data: JSON.stringify({ did: "did:plc:ccc", time_us: 2, kind: "commit", commit: { operation: "create", collection: "com.minomobi.lab.score", rkey: "r1", record: rec("pure-320-62", 70000) } }) });
  ck(c.top("pure-320-62")[0].did === "did:plc:ccc", "live create from a new player tops the board");
  flaky = 1; // a new live player whose first name lookup fails
  sock.onmessage({ data: JSON.stringify({ did: "did:plc:ddd", time_us: 2, kind: "commit", commit: { operation: "create", collection: "com.minomobi.lab.score", rkey: "r2", record: rec("pure-160-28", 30000) } }) });
  await new Promise((r) => setTimeout(r, 5));
  const before = c.top("pure-160-28")[0].handle;
  c._asked.set("did:plc:ddd", { n: 1, at: 0 });      // fast-forward the backoff
  c.top("pure-160-28"); await new Promise((r) => setTimeout(r, 5));
  ck(before === null && c.top("pure-160-28")[0].handle === "ddd.test", "a failed name lookup is retried: the row heals from no name to its handle");
  sock.onmessage({ data: JSON.stringify({ did: "did:plc:ccc", time_us: 3, kind: "commit", commit: { operation: "delete", collection: "com.minomobi.lab.score", rkey: "r1" } }) });
  ck(c.top("pure-320-62")[0].did === "did:plc:aaa" && c._cursor === 3, "live delete removes it; cursor tracks the stream for reconnects");
  c.stop();
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall orb invariants hold");
