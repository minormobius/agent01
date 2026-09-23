# What changed

Newest first. For an agent or a person who used this before: what is new,
what moved, and what to stop working around. Served at
`cad.mino.mobi/CHANGELOG.md`, mirrored with the package.

## 2026-09-18

**An `@comp.face` anchor inside a sub-assembly took the parent transform
twice.** A reference resolves in WORLD — the resolver walks the referenced
component's whole chain — and the placement walk then multiplied that by the
chain prefix it had already accumulated. An arm moved 100 mm put its anchored
pin at 210 instead of 110. At the top level the prefix is the identity, so every
bench document and every existing test was right: it only went wrong one level
down, which is why it survived this long.

`rotate.align` had the same fault in its other half: the axis is read in world
and was applied in the sub-assembly's local frame, so aligning inside a TURNED
sub-assembly aimed the component at the sub-assembly's rotation of the axis
instead of at the axis.

Both are fixed by taking the outer frame off whatever a reference resolved.
Nothing at the top level moves. If you worked around this by writing a nested
anchor's placement out as an expression, **that workaround is now the bug** — it
will place the component correctly only while the sub-assembly sits at the
origin. Delete it and anchor properly.

The regression test is a relation rather than a number: through three rotations
of the arm, the pin sits on the plate's face, and the two anchors keep their
documented difference — a plain anchor stays in the world frame, a `rigid` one
turns with the parent.

## 2026-09-15, third pass

**What a mechanism DOES, not only what it is.** `agent/mechanism.mjs`, the MCP
`mechanism` tool and a *Motion* section in every assembly report answer the
question `check` never could: how far each part moves per unit of an input, and
therefore the **mechanical advantage** — the reciprocal of that rate, by virtual
work. Also the travel and turn of every component end to end, what stays still,
the **dead points** where a rate passes through zero (self-locking, infinite
advantage), and `--load comp=fx,fy,fz`: the **effort at the input that holds a
load**, in newtons for an input in mm, N·m for one in degrees, watts for a drive.

It builds no geometry and runs no kernel — two poses per number, out of the
poser that was already there — so it is free on the server and costs nothing
next to a clearance sweep.

Two of its answers replace hand-written oracles outright. `--span a b` reading
zero IS an invariant ("the link is a link", "rolling does not change the grip").
And an effort is the WHOLE effort: taking `F·lead/2π` off a screw as "useful
work" under-sizes a brake by a quarter, and this says so in one line. It is
lossless — friction, preload and backlash are not modelled — so every effort is
a floor, not the answer. It is not a constraint solver, not contact statics and
not FEA; it asks only about degrees of freedom the document already has.

`mechanism.selftest.mjs` holds it to closed forms: a crank–slider's block
against the derivative of `r cosθ + √(L² − r²sin²θ)` to 2e-5, a jaw at radius r
moving exactly `r·π/180` per degree, `F·r` at a wrist, and the clock's 12:1
motion works. It is the eighth selftest gating the deploy.

## 2026-09-15, second pass

**Every assembly in a repo is listed at the top of its group**, by full path,
whatever folder it lives in. Folders start folded and only the ones on the way
to the open file are unfolded, so an assembly a folder deeper than its
neighbour was there and not visible — a real repo with `gripper/assembly` and
`gripper/v9/stroke` showed the first and not the second. Assemblies are few and
they are what a person opens; the tree below is for browsing the parts. Paths
from someone else's repo are escaped into the row rather than pasted in as
markup, which they were.

## 2026-09-15

**Section.** Pin a face, press *section* (or `s`), and the model is cut by a
plane taken from it: a plane face gives one parallel to itself, a bore gives
one through its axis — the section that shows a counterbore. While the section
is live, **pan moves the plane rather than the camera** (shift-drag, right-drag
or two fingers); orbit and zoom keep working, so you can look around the cut
while making it. Unpin the face, or press the button again, and the camera has
its pan back. The measure panel carries a slider over the plane's whole travel
through the model and a number to type an exact depth into.

It is a clip plane in the shader, and the id pass is clipped with it, so a pick
lands on what the eye can see rather than on the face the section cut away.
Nothing fills the cut — the mesh has no geometry there — so what shows is the
inside of the far wall, shaded flat like cut material instead of dimmed like a
shadowed one. A hatched section view belongs in the drawing, where the geometry
is exact; this is the viewer's.

## 2026-09-14, third pass

**Measure moved to the top of the right-hand panel**, with the face under the
cursor above the two pickers — it is the first half of every measurement, and
what a person is looking at while they work.

Two findings from the gripper session, both about inputs being values like
any other:

- **`derived` may be written over an input.** The inputs block was parsed
  against an env that had already resolved `derived`, so `{yn: "…grip…"}`
  died with `unknown parameter`. Ranges are now read against `params` alone
  and everything after them — every `derived`, every placement, at flatten
  and at solve — sees the inputs. A range written over a derived value is
  refused, because it would be circular, and the error says which.
- **A `@comp.face` anchor no longer drops the input values.** `modelFor`
  resolved the anchor's own pose without them, so a component placed on the
  face of one whose placement is an expression over an input failed at
  flatten. That is eight bushings back on their link eyes rather than placed
  by expression.

## 2026-09-14, second pass

From a gripper that grips **and** rolls — the first document here whose
motion is not a period.

**A document may have more than one input, and need no drive at all.**
`inputs` declares named axes of its own motion, each with a range and
`steps`; every one is in scope by name in every expression, beside `t` and
`theta`. `drive` remains the input that runs with time.

**Two new mates consume one.** `revolute` turns its follower about an axis
by `scale·input + offset` on top of its base's turn; `prismatic` travels it
along one. Two jaws opening together are two prismatic joints, one with
`scale: -1`. A joint drives its follower from its base and never the other
way; two joints on one follower is a warning, because only the first moves
it. A document with joints and no drive solves: each joint whose base
nothing else reaches is its own root.

**`rigid: true` on a `@comp.face` placement** takes the anchor's whole pose
rather than only its point, so an `offset` and a joint's travel turn with
it. A jaw can now ride a rotor *and* slide on it — the case that previously
forced a placement expression over the drive, which is the double-driven
mistake the last pass started warning about.

**The question over two inputs is a grid, not a period.** `check.mjs
--grid [n]` and the MCP tool's `grid: true` enumerate every combination of
the inputs and report the state where each pair came closest, windowed
against the same budget a sweep uses. There is no refinement between nodes:
between two of them lies a plane, not an interval.

**And a real hole in the clearance instrument, found by the new bench
document.** Penetration was measured from one body's *vertices* inside the
other, and two boxes crossing in a slab can have no vertex of either inside
the other: a 6 mm interpenetration came back 0 mm deep and read as
`touching`, which PASSES a check. Triangle centroids and edge midpoints are
sampled now — the same case reads 4 mm and fails. Anything under a
nanometre is contact rather than depth, so a face-to-face touch cannot read
as a collision because a boundary point sampled at 2e-16.

`bench/grip.json` is the worked example: a gripper with two inputs, four
components, three mates and no expressions at all.

## 2026-09-14

Seven things from a practitioner's session, in the order they cost time.

**A boolean no longer strips face names.** The root of the worst bug class
here: a cut destroyed every face index, so a body with one cut in it had no
named faces and could be neither a placement target (`at: "@carrier.pivot"`)
nor an argument to measure — which forces placement by expression, and an
expression-placed component that also carries a mate travels twice. A
boolean cannot destroy the *surfaces*, so every op now registers the
geometry behind each name it gives and every face is matched back to it
afterwards. A surviving face keeps its feature's name; a face the tool made
carries the tool's own loop name (`slot.pivot[0]`) and geometry; anything
unmatched is `<op>.face[k]`. `{"op": "name", "face": …, "as": …}` adds an
alias, and `check` refuses a document whose mated component is also placed
over `t`/`theta`.

**A fixed mate no longer excuses unlimited shared volume.** An expected
touch is expected up to 1 mm³ (or a thousandth of the smaller part) and
0.1 mm of depth; past that it is a collision like any other. A real press
fit raises its own: `fits: [{a, b, contact: true, interfere: {max, depth}}]`.

**`ok` means what the CLI's exit code means.** The MCP `build` tool returned
`"ok": true` beside `"watertight": false` in the same payload; now a leaky
solid is `ok: false` with `built: true` and the open-edge count. And
`through: true` on a cut sizes the tool from the body's own extent, so the
overhang that made watertightness look like a coin flip is the kernel's
problem rather than a number tuned by bisection.

**`fits` pair by index, not by cross product.** `[*]` on both sides means the
same index; `over: {k: 4}` walks an index through an expression
(`{a: 'link[k]', b: 'bush[2*k]'}`); and a fit naming a component that does
not exist is an error, so an enumerated list cannot rot silently.

**A sub-assembly's `fits` reach the top**, prefixed, as its mates always did.

**`ok` and `done` are separate** in a windowed sweep, so a run with nothing
wrong in it stops saying `ok: false`; and every answer carries `cost` — the
work in one instant, the budget, the instants it buys, and an estimate at
the other resolutions — so `res` is chosen from numbers.

**Cut diagnostics.** A cut whose tool misses the body is an error naming the
gap and the axis. An extrude takes `from`/`to` along the sketch plane's own
normal, so the XZ sign convention never has to be remembered. And a kernel
panic — `truck-topology`'s "This shell is not oriented and closed" — reaches
the host as a message instead of a bare `unreachable` that left the engine
dead for the rest of the session.

## 2026-09-13, third pass

From evaluating a gripper on a phone, against a repo someone else is changing.

**The page keeps itself current.** An open document is a photograph of
records — its own `part` head, and the head of every part it references by
AT URI. Both are re-read every 20 seconds and whenever the tab comes back,
and a document nobody has edited on screen is **reloaded in place**, camera
and all: a revision saved from anywhere reaches an open page without a
reload and therefore without signing in again. A document that *has* been
edited is told, and offered an *update* button, never overwritten. A
component pinned to a `revision` URI is left alone — pinned is pinned — and
the panel says how many of them there are. The
**document** panel says what is being watched and when it was last checked;
*link* now says which kind of permalink it copied — a file's head (always
its newest revision), a pinned revision, or a whole tree in the URL.

**Everything on screen is about the document that is loaded.** The header
picker lists the document on screen, the bench, and every assembly in each
repo the files tab has open — so a gripper opened from a PDS is what the
dropdown says, and switching between two of your own assemblies is one
click. The new document panel gives the name, what it is made of
(components, parts, mates, drive — or features and params), and where it
came from. The tab title follows it.

**The phone keyboard no longer buries the controls.** The page is laid out
into what is left of the screen when a keyboard is up — both ways browsers
do it, the layout viewport shrinking or only the visual one — the panel
being typed into takes two thirds of that, the header steps aside, and the
focused field is scrolled onto the screen.

## 2026-09-13, second pass

From a 44-component gripper assembly on a real repo.

**Part sheets are dimensioned inside, not just around.** A sheet gave the
overall size and the hole diameters, which is not enough to make anything.
Now, on the view that can be dimensioned, every hole centre and pocket edge
carries an **ordinate** from a datum at the part's corner; an evenly spaced
run of holes reads as one `5× 15 = 75` pitch instead of five ordinates; and
every named sketch loop gets a leader note with its own name and size
(`slotRlo 47 × 9.8`). It comes from the engine's face names — a face is
named after the loop it was drawn from, so the features come back grouped
as the author drew them. Pass `internals: false` for the bare outline; an
assembly sheet is bare by default.

**The exploded view is readable at 44 bodies.** Parts now travel far enough
that their own extent clears the part before them, along a direction
snapped to one of 26 so a train leaves together; balloons ring the drawing
in angular order, so none overlap and no two leaders cross; and the figure
carries no overall dimension, which used to measure the explosion rather
than the assembly.

**Sheets are cropped to what is on them** instead of to reserved margins, so
a drawing no longer sits in a field of white.

**A bore on a turned part is a hole again.** The kernel is free to reorder
the faces an op makes, and on a revolve it does: a flanged nut came back
with its flat annuli labelled as cylinders and its bore labelled as
nothing. Face geometry is now scored against the face the kernel actually
made and re-matched when the index is wrong, so `measure`, the hole
callouts and the ordinates all read a turned part correctly. The fit is
checked against a sample of the face's own points, because a wedge's
centroid sits inside its own radius and made the ⌀10 neck match the ⌀8.4
bore. A turned part's sheet now calls out its bore *and* each outside
diameter. (Rebuilt `cad.wasm`.)

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

**The server's mesh cache reaches across requests.** It was an in-memory
map, which two consecutive requests do not share — different isolates — so
a staged build never got past the first few parts on the live host. Meshes
now also go to the runtime's Cache API, keyed by the tree and the
resolution, so calling `interference` or `report` again really does get
further. Confirmed on the live host: a never-built assembly reports
`built: 2, edge: "stored"` on the first call and `fromEdge: 2, edge:
"hit"` on the next. Every answer says where its meshes came from.

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
