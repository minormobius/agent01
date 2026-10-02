/* node games/skein/test/skein.selftest.mjs
 *
 * The promises Skein makes, checked:
 *   - every theme pack is well formed and can span every sphere size;
 *   - every theme makes a board on every size, and each board is what it
 *     claims: letters on every tile, each word a chain of neighbours, no
 *     tile twice, every tile used, the span pole to pole, EXACTLY ONE way
 *     to split the tiles into the words;
 *   - boards are deterministic (the daily ball is the date, a link is the
 *     puzzle);
 *   - the rules: found, wrong place, extras earn hints, hints ring then number;
 *   - dict/words.txt is current with words/dict/enable1.txt.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadSkein } from "./harness.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const K = await loadSkein();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("  ✗ " + msg); } };
const SIZES = ["c80", "c180", "c240"];

console.log("theme packs");
const reachOf = {};
for (const sz of SIZES) { const s = K.sphere(sz), [a, b] = K.polePairs(s)[0]; reachOf[sz] = K.bfs(s, a)[b] + 1; }
for (const t of K.THEMES) {
  const all = t.words.concat(t.spans);
  ok(all.every((w) => /^[A-Z]{4,}$/.test(w)), `${t.clue}: words are 4+ capital letters`);
  ok(new Set(t.words).size === t.words.length, `${t.clue}: no duplicate words`);
  for (const sz of SIZES) ok(t.spans.some((w) => w.length >= reachOf[sz]), `${t.clue}: a span reaches pole to pole on ${sz} (needs ${reachOf[sz]})`);
}
console.log(`  ${K.THEMES.length} themes · poles ${SIZES.map((s) => s + " " + reachOf[s] + " tiles apart").join(", ")}`);

console.log("boards: every theme × every size, proved unique");
let boards = 0, ms = 0, attempts = 0;
for (const sz of SIZES) {
  const s = K.sphere(sz), pents = new Set(); for (let i = 0; i < s.n; i++) if (s.pent[i]) pents.add(i);
  K.THEMES.forEach((t, ti) => {
    for (const seed of ["a", "b"]) {
      const t0 = Date.now(), B = K.generate(t, sz, seed); ms += Date.now() - t0;
      if (!B) { ok(false, `${t.clue} on ${sz} (${seed}): no board`); continue; }
      boards++; attempts += B.attempts;
      ok(B.letters.length === s.n && /^[A-Z]+$/.test(B.letters), `${t.clue} ${sz}: a letter on every tile`);
      const seen = new Uint8Array(s.n); let chain = true, spell = true;
      B.words.forEach((W) => {
        W.cells.forEach((c, k) => { seen[c]++; if (k && s.nbrs[W.cells[k - 1]].indexOf(c) < 0) chain = false; if (B.letters[c] !== W.w[k]) spell = false; });
      });
      ok(chain, `${t.clue} ${sz}: each word is a chain of neighbours`);
      ok(spell, `${t.clue} ${sz}: each word is spelled on its tiles`);
      ok(seen.every((v) => v === 1), `${t.clue} ${sz}: every tile used exactly once`);
      const sp = B.words.filter((W) => W.span);
      ok(sp.length === 1, `${t.clue} ${sz}: one span`);
      const ends = [sp[0].cells[0], sp[0].cells[sp[0].cells.length - 1]].sort((x, y) => x - y), poles = B.poles.slice().sort((x, y) => x - y);
      ok(ends[0] === poles[0] && ends[1] === poles[1] && pents.has(poles[0]) && pents.has(poles[1]), `${t.clue} ${sz}: the span runs pole to pole`);
      ok(B.words.every((W) => t.words.includes(W.w) || t.spans.includes(W.w)), `${t.clue} ${sz}: words come from the pack`);
      ok(!B.words.some((W, i) => B.words.some((V, j) => i !== j && V.w.includes(W.w))), `${t.clue} ${sz}: no word inside another`);
      ok(K.countSolutions(s, B.letters.split(""), B.words.map((W) => W.w), 3).solutions === 1, `${t.clue} ${sz}: exactly one answer`);
    }
  });
}
console.log(`  ${boards} boards, ${(attempts / boards).toFixed(2)} layouts per board, ${(ms / boards).toFixed(1)} ms each`);

console.log("the solver counts honestly");
{ // a ring of tiles spelling ABAB…: two placements of ABAB tile a 4-cycle-free path two ways only when it should
  const s = K.sphere("c80"), B = K.generate(K.THEMES[0], "c80", "solver");
  const L = B.letters.split(""), words = B.words.map((W) => W.w);
  ok(K.countSolutions(s, L, words, 5).solutions === 1, "the generated board: one");
  // drop a word: the tiles can't be covered, so zero
  ok(K.countSolutions(s, L, words.slice(1), 5).solutions === 0, "missing a word: none");
  // every placement found really spells the word along neighbours
  const pl = K.placements(s, L, words[1]);
  ok(pl.length >= 1 && pl.every((p) => p.every((c, k) => L[c] === words[1][k] && (!k || s.nbrs[p[k - 1]].includes(c)))), "placements are real traces");
}

console.log("deterministic");
for (const sz of SIZES) { const a = K.generate(K.THEMES[3], sz, "daily-2026-10-01"), b = K.generate(K.THEMES[3], sz, "daily-2026-10-01"); ok(JSON.stringify(a) === JSON.stringify(b), `${sz}: same seed, same board`); }

console.log("rules");
{
  const B = K.generate(K.THEMES[12], "c80", "rules"), dict = new Set(["ABCD"]), g = new K.Game(B, dict);
  const W = g.words.find((w) => !w.span), i = g.words.indexOf(W);
  g.sel = W.cells.slice(); ok(g.submit().kind === "found" && g.found.has(i), "a word on its tiles is found");
  g.sel = W.cells.slice(); ok(g.step(W.cells[0]) === false && g.sel.length === W.cells.length, "spent tiles can't be traced");
  g.sel = W.cells.slice(); ok(g.submit().kind === "again", "found twice is 'again'");
  const sp = g.words.find((w) => w.span); g.sel = sp.cells.slice(); ok(g.submit().kind === "span", "the span is announced");
  // wrong place: fake a second copy of a word's letters by asking about a word with the same spelling on other tiles
  // (a board has one answer, so fake "other tiles" by moving where the game thinks the word lies)
  const vi = g.words.findIndex((w, j) => !g.found.has(j)), V = g.words[vi];
  const g3 = new K.Game(B, dict); g3.words[vi].key = "elsewhere";
  g3.sel = V.cells.slice(); ok(g3.submit().kind === "wrong-place", "the right word on other tiles is 'wrong place'");
  // extras and hints
  const g4 = new K.Game(B, new Set(["AAAA", "BBBB", "CCCC"])); g4.letters = "AAAABBBBCCCC" + B.letters.slice(12);
  ok(g4.hintsLeft() === 0 && !g4.useHint(), "no hint before three words");
  for (const w of ["AAAA", "BBBB", "CCCC"]) { g4.extras.add(w); }
  ok(g4.hintsLeft() === 1 && g4.useHint() && g4.hint >= 0 && g4.hintLevel === 1 && g4.words[g4.hint].span, "three words earn a hint, which rings the span first");
  ok(!g4.useHint(), "the second level costs another hint");
  ["DDDD", "EEEE", "FFFF"].forEach((w) => g4.extras.add(w));
  ok(g4.useHint() && g4.hintLevel === 2 && g4.hintsUsed === 2, "a second hint numbers the ringed word");
  ok(g4.submit().kind === "short", "a trace under four letters is 'short'");
  const s5 = new K.Game(B, dict); s5.restore(g.save()); ok(s5.found.size === g.found.size && s5.owner.filter((x) => x >= 0).length === g.owner.filter((x) => x >= 0).length, "save and restore");
}

console.log("word list");
try { execFileSync("node", [path.join(here, "../tools/dict.mjs"), "--check"], { stdio: "pipe" }); ok(true, ""); }
catch (e) { ok(false, "dict/words.txt is stale: node games/skein/tools/dict.mjs"); }

console.log(fails ? `\n✗ ${fails} failed` : "\n✓ skein selftest passed");
process.exit(fails ? 1 : 0);
