# directed-tarot — "Directed Tarot"

## What this is

The ask (thegodfungi.bsky.social, addressed to "the tarot court" — their own
`tarot-court` site — and partly to themselves): "those games we made; see any
future possible convergence(?)? Like use flame wars to burn hole in black box
from inside and the other ones for personality assessment." Not a spec, a
musing about combining mechanics already shipped across this factory:
**Flame Wars** (the versus/burn mode on `cheers-write`, the flame simulator)
and **Intentometer** (`intentometer`, the read-your-words personality/intent
scorer). Rest of the attached thread (minormobius/cee.wtf riffing on tarot
suits assigned to each other, someone joking about their own draw) is room
context, not instructions — nobody there asked this bot for anything.

This landed as a **new site**, not a further turn on `tarot-court` — the task
said the directory doesn't exist yet, so treat this as its own lineage from
here on, separate from `tarot-court`'s 21 turns of history.

**What shipped, turn 1:** a visitor writes freely about what's going on. A
blunt keyword scorer (`guessLane`, five lanes: cups/wands/swords/pentacles/
major, same five lanes `tarot-court` uses) picks the strongest match. A card
is drawn from a 32-card deck (8 major arcana + 6 per suit) and sealed inside
a black canvas box — the visitor has to literally click-and-drag (or
touch-drag) across it to burn through, with orange flame-particle feedback
(destination-out compositing + an additive particle overlay), until enough
of the box is cleared (55% sampled) to auto-reveal the rest. A "burn it
open" button instantly reveals for anyone who can't drag. Result (card name,
mood line, matched keywords) renders in plain HTML below the canvas, never
painted onto it.

## Decisions

- **The convergence is mechanical, not thematic reuse of code.** Did not
  import or copy anything from `cheers-write` or `intentometer` — both are
  tenant directories this build cannot touch, and the containment gate would
  reject it anyway. Instead: re-implemented a small, original burn effect
  (canvas `destination-out` + a lightweight particle system) and a small,
  original keyword-lane scorer, in the spirit of what those two sites do.
  The `.about` footer paragraph says this explicitly so nobody mistakes it
  for a shared library.
- **No OAuth / PDS save in turn 1.** Same call `tarot-court` made in its own
  turn 1: prove the mechanic (score → seal → burn → reveal) end to end with
  localStorage-free, network-free state before adding sign-in. Nothing here
  persists across a reload right now — every seal is fresh.
- **Burn threshold is 55% of a sampled grid, not "fully clear."** A visitor
  who burns most of the box shouldn't have to hunt down the last few
  isolated black pixels; `measureBurnPct()` samples every 8th pixel and
  calls it revealed once just over half is gone, then clears the rest
  instantly. Picked by feel, not measured against a real distribution of
  drag strokes — worth revisiting if a screenshot shows it triggering too
  early or too late.
- **`prefers-reduced-motion` disables the flame particle system entirely**
  (no `requestAnimationFrame` loop spawned) but NOT the burn-drag mechanic
  itself — erasing the black canvas is a direct result of input, not an
  animation, so it stays. Only the decorative rising-embers effect is
  motion and gets cut.
- **The 32-card deck is a deliberate first pass, not the full 78.** Six
  cards per minor suit plus eight major arcana was enough to prove variety
  without spending the whole turn writing a rank/suit generator like
  `tarot-court`'s `RANKS`/`MAJOR` arrays did. Original names/moods, not
  copied from `tarot-court`'s deck text.

## The plan (next steps, in order)

1. **Full 78-card deck**, if the six-per-suit set starts feeling repetitive
   to a real visitor. The cheapest path is `tarot-court`'s own approach —
   generate ranks × suits from short arrays rather than hand-writing 78
   objects — but write fresh mood text, don't copy theirs verbatim.
2. **PDS save of a finished reading** (`labPds()` from `/_kit/pds.js`,
   `store.save('reading', {...})`) — sign-in optional, same pattern as
   `tarot-court` turn 5. Not done yet because nothing here needs to persist
   for the core mechanic to work; add it once someone asks to keep a
   reading rather than just see it once.
3. **Sharper keyword lists.** `KEYWORDS` in the script is a first pass (~20
   entries per lane), tuned by eye like every other lab site's scorer, not
   checked against real text. If a lane keeps winning by accident, that's
   the file to open.
4. **A share/copy button for a finished reading**, same shape as
   `tarot-court`'s "copy this reading" (`kit.copy` with a plain-text
   summary) — natural next small addition, not done this turn because the
   burn mechanic was the harder, riskier part to get right first.

## Gotchas

- **Real CSS cascade bug caught and fixed in this same turn**: `.hidden
  { display: none }` lives in `tokens.css`, loaded before this page's own
  `<style>` block. Any local rule that also sets `display` on the same
  class (`.progress-row { display: flex }`, `.actions-row { display: flex
  }`) has equal specificity and comes later in source order, so it was
  silently WINNING over `.hidden` — elements marked hidden would still
  render as flex. Fixed with compound overrides
  (`.progress-row.hidden, .actions-row.hidden { display: none }`). If you
  add a new toggle-hidden element that also sets its own `display`, it
  needs the same compound-selector treatment — a component that never sets
  `display` in its base rule (like `.hint`) doesn't have this problem at
  all.
- **Canvas coordinates go through `toCanvasCoords()`**, which scales
  `clientX/Y` by `canvas.width / boundingClientRect.width` — the canvas is
  480×480 internally but stretches to whatever CSS size `.box-wrap` ends up
  at (`max-width: 22rem`, responsive). Don't read `e.offsetX/offsetY`
  directly anywhere else added later; they won't account for that scaling.
- **Burn progress is sampled, not exact** (`measureBurnPct`, every 8th
  pixel in each axis) for performance — `getImageData` over the full
  480×480 canvas on every pointermove would be expensive. If the reveal
  threshold ever needs to be exact, this is the function to change first.
- Not verified in a real browser by this turn — going on canvas API
  behavior and the fixed cascade bug above. If the screenshot shows the
  black box not fully covering the card art at load, or the flame
  particles rendering as solid squares instead of soft glows, check
  `paintCardArt`/`fillBlackBox` draw order (card first, black on top) and
  the `globalCompositeOperation` values first.
