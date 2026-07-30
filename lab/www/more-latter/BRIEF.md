# BRIEF — more-latter / "Infinite You"

## What this is

The requester (norvid-studies) posted a thread reply to an earlier Escher-tiling
build (`take-escher`, aka "Shoal" — a hyperbolic fish tiling): "more the latter,
like turn any pfp you enter into this kind of escher hyperbolic circle tiling
situation." In the thread, someone else (abeliansoup) had asked whether the ask
was "this effect but a website" or "hyperbolically tile BYO <fish but whatever
you want actually>" — two readings. "More the latter" picks the second: not
another fixed fish shape, but tile *any* image the visitor supplies — here,
their Bluesky avatar, since that's the only image a lab site is allowed to pull
in under the one-rule-with-teeth (subject the visitor named).

Turn 1 shipped: a real hyperbolic {p,q} reflection tiling (edge-reflection BFS,
same proven construction as take-escher, written fresh rather than imported —
tenant directories can't share code), rendered as a fixed patch of ~220 tiles.
Type or pick a Bluesky handle, its avatar loads through `/_img/` (avoids the
CDN canvas-taint issue), and gets warped onto every tile as a set of
triangular wedges fanned from the tile's own centre — one affine solve per
wedge, using the actual reflected (and therefore sometimes mirror-flipped)
tile vertices as the destination. Drag the disk to pan; the whole tiling
glides as one rigid Möbius isometry, so tiles stay edge-locked by construction,
same principle as take-escher's early turns. "next tiling" cycles four {p,q}
presets; "reset position" re-centres.

## Decisions

- **Wrote the hyperbolic math fresh instead of copying take-escher's.** The
  containment gate only allows writes inside this tenant's own directory, so
  there's no way to share a module between `take-escher/` and `more-latter/`
  even if it were desirable. The formulas (Möbius matrices, edge reflection
  via move-to-origin-reflect-move-back) are standard hyperbolic geometry, not
  invented here; I read take-escher's implementation first to avoid
  re-deriving from scratch, then wrote my own copy of the same standard
  approach.
- **Per-triangle affine texture warp, not a fixed vector shape.** take-escher
  placed a hand-authored fish outline via barycentric weights over each tile's
  fan triangles. This build instead solves a full 2x3 affine transform per
  wedge (source: image centre + two adjacent points on the image's inscribed
  circle; dest: tile centre + two adjacent real, already-Möbius-transformed
  vertices) and draws the avatar image through `ctx.clip()` + `ctx.transform()`
  + `drawImage`. That generalises to *any* image without hand-authoring a
  shape, which is the whole point of "whatever you want" over "fixed fish".
  Verified the transform formula algebraically against an identity-triangle
  case (source == dest → expect the identity matrix) since there was no
  browser to test in.
- **Mirroring on alternating tiles happens for free.** Because the destination
  triangle is the tile's own (possibly orientation-reversed, since reflection
  is anti-conformal) real geometry, and the source correspondence is always
  the same fixed canonical points, the affine solve's own handedness flips
  automatically when a tile has been reflected an odd number of times — no
  separate "mirrored weights" table was needed, unlike take-escher's
  `fishWMirrored`. Reasoned through carefully but, again, unverified in a
  real browser.
- **No infinite buffer this turn — a static generous patch instead.**
  take-escher took *seven* turns to get from "fixed patch" to "true endless
  buffer with recentring by conjugation," and the last two of those turns were
  fixing real bugs in that machinery (a stamped-double-tiling artefact, then a
  buffer-can-only-shrink bug). Porting that whole system in one 20-minute turn
  with no way to test it felt like the wrong risk to take. A fixed ~220-tile
  patch with rigid-isometry panning is exactly what take-escher's own turns
  1–3 shipped, and the thread's reaction to that stage was "this ones good...
  interesting start." Scoped this turn the same way, deliberately.
- **Site name avoids "Escher" in the title/heading**, mirroring the
  trademark-caution logic in CLAUDE.md even though this is a person's name
  rather than a commercial mark — take-escher itself only uses "Escher" in
  body copy, never the title, so I matched that convention rather than
  re-litigating it.

## The plan (next agent, in order)

1. **Verify in a real browser — there was none available this turn.** Highest
   priority: confirm avatars actually load through `/_img/`, that the
   triangle warp doesn't look inverted or garbled on a mirrored tile, and
   that touch drag works on a phone-sized viewport. If the avatar looks
   inverted specifically on odd-depth tiles, the "mirroring happens for free"
   reasoning above was wrong somewhere — check whether `screen[]`'s point
   order is actually reversed by `reflectAcross` the way I assumed, or
   whether the UV fan's index correspondence needs an explicit flip after
   all (see take-escher's `fishWMirrored` for the fallback approach).
2. **Port take-escher's endless buffer, exactly as it stands now (turn 7).**
   That file already has the working recipe: `faceMap` + `frontier`,
   `growBuffer`/`retireBuffer` running every pointermove, and
   `maybeRecenter()` re-rooting the coordinate frame by conjugating every
   live tile's vertices through the Möbius isometry that sends the on-screen
   central tile back near the origin (`g = mCompose(g, T)`, verts remapped
   by `Tinv`). The two subtle bugs it hit — over-cap frontier tiles getting
   permanently discarded instead of deferred, and `faceKey` going stale after
   mutating `.verts` without recomputing it — are already fixed there; just
   don't reintroduce them.
3. **Performance check under the buffer.** Each tile here costs `p`
   `drawImage` calls (a fan of triangles), not one fill like take-escher's
   fish — so a live buffer of a few hundred tiles could mean 1500+
   `drawImage` calls per frame during a drag. If that's visibly slow on a
   real device, drop `HARD_CAP` before doing anything more invasive (the knob
   take-escher's own BRIEF recommends turning first).
4. **The affine warp is an approximation, not the true conformal map** —
   noted honestly in the page copy already. Worth revisiting only if it
   visibly distorts recognisable avatars (faces) more than is charming; the
   fix is finer triangulation (more source/dest points per tile, not just the
   centre-plus-two-adjacent-vertices fan), which costs more `drawImage` calls.
5. **Two-coloring is BFS-depth parity, not a true face 2-coloring** — same
   caveat take-escher documents, same reason (odd-`q` presets like {7,3} have
   an odd cycle at each vertex, so no true 2-coloring exists). Cosmetic only.

## Gotchas

- **No browser, at all, this turn.** Everything above about the mirroring
  working "for free" and the transform formula being correct is reasoned
  algebra plus one hand-checked identity-triangle test case, not an observed
  render. Treat it as the first thing to confirm, not a settled fact.
- **`ctx.clip()` must be called before `ctx.transform()` for the image draw**,
  in the *current* (dpr-scaled) coordinate space, using destination
  (screen-pixel) coordinates — not source (image-pixel) ones. Getting the
  order backwards, or clipping in the wrong coordinate space, silently draws
  either nothing or the whole unclipped image. `drawImageTriangle()` does
  `beginPath` → triangle in dest coords → `clip()` → *then* `ctx.transform()`
  → `drawImage(img, 0, 0)`. Don't reorder this.
- **`img.crossOrigin = 'anonymous'` is set but not load-bearing** here since
  `/_img/` is same-origin — left in defensively in case a future edit adds
  canvas readback (`toDataURL`/`toBlob`) for a "save this" feature, which
  *would* need it, or would need to confirm same-origin makes it moot.
- **`avatar` may be absent** on a profile (fixture confirms the field exists
  normally, but ATProto profiles are optional records) — handled with an
  explicit check and `kit.showError`, not a silent blank canvas.
- The `mCompose(M1, M2)` convention inherited from take-escher's approach
  means "apply M2 first, then M1." Get this backwards anywhere and a drag
  pans in the wrong direction or jumps.
