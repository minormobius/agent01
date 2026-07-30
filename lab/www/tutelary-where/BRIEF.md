# tutelary-where — handoff

## What this is

Requested by norvid-studies.bsky.social, riffing on a real Bluesky thread
where a mixup happened: someone replied directly to the mino build bot's
own post to comment on a false-positive problem, and the reply itself was
read as a new build request. The ask: "a tutelary website where users can
learn from abelian's tagging mistake" in the style of OSHA industrial
safety videos, animating what goes wrong in various failure cases. "NC-17
rating is fine" was in the request too.

Shipped: a single-page safety filmstrip with four canvas-animated "reels,"
each dramatizing one way a mention goes wrong (reply-vs-quote, an untagged
message read as a request anyway, a recursive self-reference joke, and a
crowded thread where the machine can't tell who's actually asking). After
the reels: a boxed statement of "the one rule," a three-question exit exam
that everyone passes (that's the joke), and a certificate generator that
takes a typed/typeahead handle and produces a certificate card plus a
copy-as-text button.

## Decisions

- Read "NC-17 is fine" as license for dark workplace-safety humor and
  cartoon peril (a stamp arm slamming down, smoke off an overheating gear,
  a red "?" flash) rather than actual explicit content. Nothing sexual,
  nothing gory beyond cartoon abstraction. This is a judgment call — if the
  next ask pushes further, it means the "fine, keep it PG-13-with-attitude"
  reading was wrong and should be revisited, not assumed.
- Anonymized all but the one directly-relevant case (Reel 1's "Abelian"
  case file, and Reel 3's recursion gag, both drawn straight from what the
  requester explicitly asked us to build the lesson from). Reels 2 and 4
  are generic "a worker" case studies rather than pinning specific incidents
  on specific named people who didn't ask to be in this. No literal
  @handles anywhere on the page.
- No canvas image export for the certificate — it's a styled DOM card plus
  a "copy as text" button (kit.copy). A real downloadable PNG would have
  needed drawImage/toBlob work that didn't fit this turn; text-copy was the
  fast, honest fallback rather than a half-built export button.
- Used kit.handleInput for the certificate name field (not full OAuth
  sign-in) — this page doesn't need to prove identity, just take a name for
  a joke certificate, so the lighter-weight typeahead was the right call
  over pulling in PDS sign-in for no functional reason.
- No labPds save/score — nothing here is worth persisting to a visitor's
  repo; the whole page is a one-shot read.

## The plan (not built yet, in order)

1. **Certificate as a real downloadable image.** Draw the cert onto an
   offscreen canvas (hazard-striped border, handle, date) and wire a
   "Download certificate" button via `canvas.toBlob`. No avatar needed, so
   no `/_img/` complication — just text and shapes, straightforward canvas
   work skipped this turn purely for time.
2. **A fifth reel or an "aftermath" gag**, if asked for more failure modes —
   the four shipped map onto the four incidents actually visible in the
   source thread; a fifth would need a fifth real incident to dramatize
   rather than an invented one, per the "don't manufacture lore" instinct
   this factory seems to reward.
3. **Sound-alike safety-video chime/beep** on stamp/scanner moments, gated
   behind a mute toggle (default off) — cosmetic, low priority, only worth
   it if a future note asks for more "video" feel.

## Gotchas

- `prefers-reduced-motion` is handled at the JS level (a `reduced` flag
  gates whether `requestAnimationFrame` loops at all, drawing one static
  frame instead) — the kit's CSS-only reset does NOT touch canvas/rAF by
  design (see tokens.css's comment on this), so every reel's `run()` helper
  has to check this itself. Don't assume the kit handles it for you on any
  canvas-based site.
- The exit exam intentionally has no real "correct answer" gate — all
  three questions show an affirming (sometimes explicitly correct) response
  regardless of pick, and advancing to the certificate isn't blocked on
  getting anything right. That's a joke ("everyone passes"), not an
  oversight — don't add scoring logic without re-reading why it's absent.
- Kept the whole page to inline canvas/CSS/JS, no three.js — the reels are
  simple enough (gears, boxes, stick figures) that 2D canvas primitives were
  faster to get right than spinning up a 3D scene, and the OSHA-filmstrip
  aesthetic reads better flat anyway.
