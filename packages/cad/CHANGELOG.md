# What changed

Newest first. For an agent or a person who used this before: what is new,
what moved, and what to stop working around. Served at
`cad.mino.mobi/CHANGELOG.md`, mirrored with the package.

## 2026-09-13

**An assembly report.** A drawing of an assembly is a picture; this is the
document that goes with it. One self-contained HTML page:

```bash
node agent/report.mjs bench/lift.json --out lift.html [--t 0.5] [--explode 0.8]
```

the **report** button on the page, and the MCP `report` tool (the page comes
back as an embedded resource, the parts list and steps as data). On it:

- the assembly in three views, posed at `t`;
- an **exploded** isometric with a numbered balloon on every item — parts
  pushed out from the centre, along their own axis where they sit on it, and
  further out when they are behind another part going the same way, so a
  stack separates from itself;
- a **parts list**: item, part, quantity, the component ids, volume, size —
  every row links to that part's own sheet below and opens it in the viewer;
- a **drawing of every distinct part**, with its holes called out;
- the **assembly steps**.

The steps are read off the document, never inferred: where a component is
placed, what face it sits on (`@platform.pivot[i]` — "each sits on
`platform`'s `pivot[0]`, `pivot[1]`… turned onto that face's axis"), what
mates it and with which numbers ("rides `screw` as a nut — 2 mm of travel
per turn"), and what clearance a pair is designed to keep. A repeat is one
step, not four. Order is the document's own, which is a build order because
a reference must name a component declared before it. A test asserts that no
step contains a sentence the document does not state.

A part the exact kernel cannot build here (a boolean Truck refuses; the
viewer does it with OCCT) is named on the page with its error and left out
of the drawings, rather than failing the whole report.

## 2026-09-12, second pass

From a practitioner's findings on the first pass.

**Contact is not collision.** A pair touching with no depth is `contact`
now (passes), `collision` only with depth or containment. Demand a
clearance and a touch is `close`.

**Designed fits.** An assembly may declare the clearances it intends:
`"fits": [{ "a": "screw", "b": "nut", "min": 0.05, "max": 0.15 }]` —
`[*]` for every instance of a repeat, `"contact": true` for a designed
touch, either order of the pair. A declared pair is judged on its own
numbers: `fit`, `close` (under `min`), `loose` (over `max`) — never
against the clearance you demand of everything else. A fit on a
screw-mated pair takes precedence over the mate's implied touch. Seven
verdicts in all; `ok` is true when every pair is `clear`, `contact`,
`expected` or `fit`. `bench/lift.json` declares three.

**Finer meshes for clearance.** The clearance check tessellates at
`res: 256` (chord tolerance 0.0025 mm, was 0.01): a designed 0.1 mm bore
now reads 0.098, not 0.093; a plane-to-plane 1.000. Build time is higher
in that mode. (Rebuilt `cad.wasm`: `res` above 64 now also tightens the
exact kernel's chord tolerance.)

**One travel, not two.** A component placed by reference on another
(`at: "@platform.pivot[i]"`) already follows it; a `fixed` mate between
the two no longer adds the travel again.

**Travel is carried in world.** A `fixed` or `slider` follower placed at
an angle to the part it rides now moves the same world direction as its
leader, whatever its own axes. A nut that needed its own `screw` mate to
move with the carriage does not any more.

**`i` in `derived`.** A derived that mentions `i` is evaluated per repeat
instance (`"bx": "r*cos(2*pi*i/6)"`); outside a repeat `i` is 0.

**On the page:** the files tab is a tree — folders from the paths'
slashes, folded until you open them, assemblies before parts, counts in
the heading; a **measure** panel lists every named face (of every
component, posed, in an assembly) so two picks give a distance without
hovering; handle suggestions open in a list under the field instead of
the browser's own popup over it.

**Generated drawings.** An engineering drawing as SVG, from the same exact
meshes everything else reads — three places, one picture:

```bash
node agent/drawing.mjs bench/plate.json --out plate.svg
node agent/drawing.mjs bench/lift.json --t 0.5 --out lift.svg   # posed
```

the **drawing** button on the page, and the MCP `drawing` tool (the SVG
comes back as an embedded resource, the numbers beside it). Third-angle
views — front, top and right by default, `iso` and the other four on
request — hidden lines dashed, the overall width, height and depth
dimensioned, and every hole called out by count and diameter (`3× ⌀1.2`),
with `↧` and its depth when blind. A bore is four exact arcs, so its four
cylindrical faces are grouped back into one hole; a surface that faces away
from its axis is a boss and is not called out. On an assembly every
component is posed and `reference` ones are left out. Deterministic: two
drawings of one tree diff cleanly.

**Sweeps on the server fit in the server.** A big assembly used to kill the
request (code 1102). Now the `interference` tool answers in pieces and says
which piece you have:

- exact meshes are **cached between calls** in the isolate, and a few new
  parts are built per call: `incomplete: "parts"` with what is left, so
  calling again with the same arguments gets further (a 60-tooth gear is
  ~30 s of CPU on its own);
- a sweep that does not fit answers `done: false` with `next` and the
  window it covered: call again with `from: next` until `done`, then take
  the smallest distance per pair across the windows;
- an assembly whose *single instant* is past the budget is refused —
  `incomplete: "too-big"`, with the numbers — instead of being killed
  mid-call. Pass **`res: 128` or `res: 64`** for coarser, much cheaper
  meshes (chord error 0.005 or 0.01 mm against 0.0025 at res 256), check
  fewer components, or run it locally;
- refinement between samples now runs only for pairs within four times the
  clearance (and at least 1 mm) — a pair 10 mm apart cannot graze. On the
  lift that is 7 pairs of 21, locally too (`agent/check.mjs` says how many).

The budget is counted in work, not time: a Cloudflare Worker freezes its
clock during synchronous execution, so a wall-clock budget never trips.
Locally there is no budget at all, and for something the size of the clock
`agent/check.mjs` remains the faster path.

## 2026-09-12

**Interference is a server tool.** The MCP `interference` tool now runs on
`cad.mino.mobi/mcp`. It cannot give shared volumes there (Manifold's glue
needs eval, which Workers forbid), so it runs in **clearance mode**: every
pair's nearest approach from the exact meshes, with a verdict per pair —
`collision`, `expected` (a fixed- or screw-mated touch), `close` (under
the `clearance` you pass), `clear`. Pass `clearance` (0 flags only
contact), and `sweep` for a whole cycle. Volumes still come from
`agent/check.mjs` locally.

**Sweeps find grazes between samples.** `--sweep N` (and the tool's
`sweep`) chases each pair's minimum between samples with a golden-section
search in clearance mode. Eight samples that see 1.18 mm at best now
report the 1 mm graze at t = 0.07 s.

**A clearance table.** `node agent/check.mjs asm.json --clearance 1
[--sweep N]`: nearest approach per pair — crossing, contained, touching,
or the distance — with the verdict above. Exit 1 on a collision or a pair
closer than the clearance. Distances are chord approximations of curved
faces: within the mesh's sagitta, under 0.02 mm on the bench parts.

**Measure across an assembly.** `node agent/measure.mjs asm.json
finger-r.pad finger-l.pad --t 0.5`, and the MCP `measure` tool with
`component.face` names and `t`: two parts' named faces posed at an
instant, plane to plane or axis to axis.

**Reference components.** `"reference": true` draws a component
translucent and keeps it out of the interference check, the clearance
table and the export. `hidden` is display only; every tool still counts a
hidden component. If you used `hidden` to mean "not a real part", say
`reference` instead.

**Golden invariants and a corpus audit.** Every part the publisher writes
now carries the invariants it was judged by (volume, area, χ, watertight,
face count, kernel). `node agent/audit.mjs --at <handle> --kernels`
rebuilds every head in a repo and diffs it against the record, and checks
Truck and Manifold agree on volume within `--tol` (1 %). The publish
workflow runs it on the bench after every publish. Its first finding:
Truck's 60-tooth gear build is not deterministic (χ −40 or −41 run to
run; it is not watertight), so a non-watertight part is held to its face
count and its volume to a part in a thousand, not its mesh χ.

**The union error names its loops.** A region whose outer loops Truck
cannot union now fails with `union of outer loops \`body\` and \`slot\`
failed — do their outlines overlap or touch? Overlapping outlines must be
drawn as one path, or the second made a separate op`. (Rebuilt
`cad.wasm`.)

**`check` on an assembly.** The MCP `check` tool resolves an assembly: its
params and derived at t = 0, every placement expression and reference, and
each distinct part — so an undefined name fails before any build.

**Mates carry travel.** `screw` (`lead`, `axis?`), `rack` (`r` or
`m`,`z`), `belt` (`ra`,`rb` or `za`,`zb`, same sense), `slider`
(`ratio?`), and `fixed` now carries travel as well as turning. Each works
in either direction from the drive. A component's pose is its placement,
then its travel in its own frame, then its turn about its own z. Nut-on-
screw pairs join fixed pairs as expected touches.

**Repeat.** `"repeat": 4` on a component makes `id[0]` … `id[3]` with `i`
in scope for `at`, `rotate`, `offset`, references and `params`.

**Place by feature.** `"at": "@platform.pivot[i]"` puts a component's
origin on a named face of an earlier component (a bore's centre on its
sketch plane, a plane's centroid); `"rotate": { "align": "@…" }` turns its
local +z onto the face's axis or normal; `offset` moves in that frame. The
op prefix may be left off; bracket contents are expressions. The reference
follows the referenced component through its motion. `bench/lift.json`.

**Placements are expressions.** A document's `params` and `derived` (any
key order — a PDS returns keys sorted) with `t` (seconds) and `theta` (the
driven angle, degrees) may appear in any `at`, `rotate`, `offset`, `drive`
or mate number. `deg(x)` is degrees → radians; `rad2deg(x)` the reverse,
for `rotate.deg`. `bench/crank.json`.

**The social layer** lives at `cad.mino.mobi/parts/` (not
`parts.mino.mobi`: the zone is at Cloudflare's custom-domain ceiling).

**Sessions stopped expiring.** The auth worker refreshed its PDS token on
every proxied call; refresh tokens are single-use, so two calls in flight
revoked the session. The token is cached now. Sign in once more if yours
died before this.

**Handle fields suggest accounts** as you type, on every handle input.

## 2026-09-11

The read gateway (`/xrpc/`), the files tab over ATProto records, the
node-only loop (`agent/build.mjs`), the MCP server, the published bench
in `minomobi.com`, the tangled mirror, and the system page at `/docs/`.
