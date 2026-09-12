# What changed

Newest first. For an agent or a person who used this before: what is new,
what moved, and what to stop working around. Served at
`cad.mino.mobi/CHANGELOG.md`, mirrored with the package.

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
