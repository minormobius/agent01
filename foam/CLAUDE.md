# foam — CLAUDE.md (first person in the voronoi foam)

You are working on **foam**, the first-person interactive space inside the
rind's voronoi foam, at `foam.mino.mobi`. The rind ([`rind/`](../rind)) models
the foam as *structure*; foam is the same idea *inhabited* — you stand inside a
chamber, the membranes seal every face around you, and the shiva tools let you
shatter and re-weave them, up close. The design brief it grew from: a
first-person view into the foam, toggleable membranes, a tight close-up on
membrane creation/destruction, heading toward a puzzle platformer — with mobile
AND desktop performance a hard requirement.

## The three files

| File | What it is |
|---|---|
| `foamworld.js` | **the kernel** — seeded pocket generation + the walk certificate. Layered, anisotropic 3D Voronoi (convex cells by half-space clipping, global epsilon-weld so the complex is watertight), every shared face extracted as a MEMBRANE, and a nav graph under the movement rules (below). `generatePocket({seed})` retries salts until the certificate proves start → target solvable, so **every published seed carries a constructive proof**. Runs in node and the browser — the selftest and the game consume the same module. |
| `app.js` | **the game** — WebGL2 renderer (one sorted-alpha membrane draw, no depth buffer, per-face state in an RGBA32F texture, x-ray edge pass, adaptive-resolution governor), walker physics (support probe + plane clamps driven by the same face classification the certificate uses), the shiva tools (raycast → per-face dissolve/growth animations in the fragment shader), touch + pointer-lock input, HUD. |
| `test/foamworld.selftest.mjs` | pins determinism, watertightness (per-cell Euler V−E+F=2, volumes sum to the box), membrane pairing/orientation/planarity, and the certificate: route crossings are wall-class with standing clearance, all support faces within grade, par in the puzzle band. Run: `node foam/test/foamworld.selftest.mjs` (~4s, 8 seeds). |

## The movement rules (the honesty contract)

These are enforced **twice from one source**: the kernel's classification
builds the certificate, and the app's physics reads the same fields.

1. **No jumps.** There is no jump input. A crossing through a floor-class
   plane (slope ≤ maxGrade) is never a nav edge — you can fall through a
   shattered floor, never rise through one.
2. **Max grade 0.7 (35°).** Only faces within grade are support. The `aniso`
   metric (vertical distance weighted 2.2×) is what makes grade a meaningful
   discriminator — floors flatten, walls steepen, and the climb texture comes
   from `rampFrac` seeds thrown off-layer.
3. **Membranes are the only thing that opens.** Edges are structure and never
   break (the rind rule); the pocket hull (boundary faces) is indestructible.
4. A crossing needs **standing clearance** (1.75 m) and floors on both sides
   meeting the membrane's lower rim (shared welded vertices ⇒ the walk
   surface is continuous — no hidden steps).

Change any of these in one place only: `foamworld.js` option defaults. If you
touch the classification, the selftest must still pass — it is the proof the
game leans on when it prints "par".

## Performance discipline (this matters — more features are coming)

- ONE membrane draw call (sorted back-to-front indices, rebuilt every other
  frame), ONE edge line draw, no depth buffer at all, premultiplied alpha.
- All per-face dynamic state lives in one RGBA32F texture (2 texel rows per
  face: mode/tStart/flags/boundary + hitPoint/radius); animations are
  entirely in-shader — a shatter costs one `texSubImage2D`, not a rebuffer.
- The adaptive-resolution governor (the hoop/v109 pattern) steps the
  drawing-buffer scale down to 0.6× on sustained slow frames and back up.
- Physics is cell-local: support/collision only probe the current chamber and
  its adjacent cells (`adjacent[]`), raycast only chambers ≤2 open hops away.
  Keep it that way — nothing in the hot loop may scan all faces.

## Verifying changes from the sandbox

Headless Chromium drives the real page (SwiftShader): serve `foam/` with any
static server, then walk/shatter/screenshot via playwright — see the session
pattern: assert containment against closed membranes, chamber handoff after a
shatter, `window.__foam` probes (fps, breaches, player). The `__foam` debug
hook is load-bearing for that harness; keep it.

## Deploy

- Push `foam/**` on `claude/voronoi-foam-interactive-keo0uy` (the owning
  branch — see `deploy-registry.json`) → `deploy-foam.yml` runs the selftest,
  then `wrangler deploy`. The sandbox cannot deploy; push and let the Action
  run. **First deploy also creates the custom domain** — verify the log binds
  `foam.mino.mobi (custom domain)` (the golden rule), then that `/` serves
  the game and `/health` answers.

## Where this is heading (agreed direction, not yet built)

Puzzle-platformer campaign over the pocket family: pocket N links to N+1;
creation puzzles (weave a membrane to seal a hole and walk over it — the
kernel already treats a re-woven floor as support); chunked/streamed pockets
for bigger worlds; par leaderboards. Design against the kernel's certificate:
a mechanic that can't be certified solvable doesn't ship.

## Invariants — do not break

1. **Determinism.** `(seed) → identical pocket` everywhere — no unseeded
   randomness anywhere in `foamworld.js`.
2. **Every published seed is certified.** `generatePocket` must keep refusing
   to return an unproven pocket.
3. **Edges are structure, plates are not.** Shattering never removes frame
   geometry; the hull never opens.
4. **Pure static.** No build step, no dependencies, no D1/DO/secrets.
5. **The kernel is the single source of the movement rules** — the app reads
   its classification; it never re-derives its own.
