/* Ouroboros computes: a tag system run on the snake's own body (js/tag.js).
   The machine on its own, the snake's moves that can't run into themselves,
   the snake computing Collatz exactly in a quiet world, and how often the
   real world's bends let it.
     node games/molt/test/tag.selftest.mjs   (~10 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const T = await import(path.join(here, "../js/tag.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
const collatz = (n) => { const v = [n]; while (n > 1) { n = n % 2 ? (3 * n + 1) / 2 : n / 2; v.push(n); } return v; };
const visits = (t, sys) => { const seen = []; while (t !== null) { const v = T.collatzValue(t); if (v && seen[seen.length - 1] !== v) seen.push(v); t = T.tagStep(t, sys); } return seen; };

/* ---- the machine on its own */
{
  let right = true;
  for (let n = 1; n <= 60; n++) if (visits("a".repeat(n), T.COLLATZ).join() !== collatz(n).join()) right = false;
  ok(right, "the tag system a → bc, b → a, c → aaa (delete 2) passes through exactly the Collatz path of n from a × n, for every n to 60, and halts at a");
}

/* ---- the glyphs: two moves a symbol, each ending the way it began, and no string of them runs into itself */
{
  const turn = { S: 0, L: 1, R: -1 }, DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  let level = true, simple = true;
  for (const g of Object.values(T.GLYPH)) if ([...g].reduce((h, t) => h + turn[t], 0) !== 0) level = false;
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400; k++) {
    let x = 0, y = 0, h = 0; const seen = new Set(["0,0"]);
    for (let i = 0; i < 60; i++) for (const t of T.GLYPH["abc"[(rnd() * 3) | 0]]) { h = (h + turn[t] + 4) % 4; x += DIRS[h][0]; y += DIRS[h][1]; const key = x + "," + y; if (seen.has(key)) simple = false; seen.add(key); }
  }
  ok(level && simple, "every glyph ends facing the way it began, and 400 random tapes of 60 symbols, walked on a flat grid, never cross themselves");
}

/* ---- the snake computes: in a quiet world (a ghost to itself) the body is the machine's tape after every step */
{
  let all = true, steps = 0, bodies = 0;
  for (let n = 2; n <= 12; n++) {
    const s = new T.TagSnake("a".repeat(n), T.COLLATZ, 1, { bite: "pass" }), seen = [];
    let machine = "a".repeat(n);
    while (!s.halted && !s.broken && s.moves < 100000) {
      const r = s.step();
      if (r && r.tag) {
        machine = T.tagStep(machine, T.COLLATZ); bodies++;
        if (s.tape !== machine) all = false;
        const v = T.collatzValue(s.tape); if (v && seen[seen.length - 1] !== v) seen.push(v);
      }
    }
    steps += s.tagSteps;
    if (!s.halted || s.tape !== "a" || [n, ...seen].filter((v, i, a) => a.indexOf(v) === i).join() !== collatz(n).join() || s.g.world.L !== s.g.body.length) all = false;
  }
  ok(all, "in a quiet world the snake computes Collatz for every start from 2 to 12: after each of " + bodies + " tag steps its body spells exactly the machine's tape, it passes through every number on the path, and it halts at 1 (" + steps + " tag steps)");
}

/* ---- the real world: the tape bends the world, and a bend can knock the snake into itself */
{
  const made = [], why = {};
  for (let n = 2; n <= 14; n++) {
    const s = new T.TagSnake("a".repeat(n), T.COLLATZ, 1).run(100000);
    if (s.halted && s.tape === "a") made.push(n); else { const k = /bit/.test(s.broken) ? "bit itself" : /cut/.test(s.broken) ? "cut by the world's bends" : "tape knocked off"; why[k] = (why[k] || 0) + 1; }
  }
  ok(made.join() === "2,3,4,5,6,8,10,12", "in the real world (measured, and pinned): from 2 to 14 the snake computes its way to 1 from " + made.join(", ") + "; the rest " + Object.entries(why).map(([k, v]) => v + " " + k).join(", ") + ", every one caught by the check that the body spells the machine's tape");
}

console.log(fails ? `tag: ${fails} of ${checks} checks FAILED` : `tag: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
