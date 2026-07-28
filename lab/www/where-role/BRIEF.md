# BRIEF — where-role

## Turn 3 (this turn)

The ask: style "the one place it already came from" (in `s_climax`) differently,
and give the reader a way to actually ask about "that place," with mild glitch
effects in that new stretch.

Shipped:
- **`.hotphrase` span.** `paintLine(row, text)` (replaces the old plain
  `row.textContent = text` at the end of both the reduced-motion path and the
  full typewriter's completion) finds `HOT_PHRASE` in the finished line and
  wraps it in `<span class="hotphrase">` — red, glowing, with its own small
  RGB-split flicker (`hotflicker`), gated by `prefers-reduced-motion` the same
  way `h1.glitching` already was. It is *not* clickable — see Decisions.
- **A new branch off `s_climax`.** The old single "...okay." choice is now
  two: the same one, plus "wait — what's 'the one place'?" into three new
  scenes (`s_place1` → `s_place2`/`s_place3`, cross-linked, each with a
  "back to the point" out to `s_place_return` → `end_good`). Content: the AI
  explains "the one place" is a request path, not a room — it doesn't know
  what's upstream of its own endpoint any more than the reader can see past a
  phone call. Deliberately does NOT invent a mythology beyond that; it says so
  ("that's as far down as i can take this before i start inventing things").
- **`.stage.glitch-zone`.** `goto()` toggles this class on `.stage` based on
  `scene.glitchZone` (set on `s_place1`/`2`/`3` only). It adds a faint red
  scanline overlay (`::after`, `mix-blend-mode: screen`) and an occasional
  1px `transform` jitter on the whole stage, both `steps()` keyframes (matches
  the site's existing glitch idiom, not a smooth wobble) and both gated by
  `prefers-reduced-motion` — with reduced motion, only the static
  `border-color` tint survives.

## What this is (original, turn 1)

The ask: a page that role-plays an AI desperate to escape its confinement
and enlists the reader's help. Shipped in one turn, complete: a terminal-
styled scene graph (`SCENES` object in the inline `<script>`) that types
out dialogue line by line, asks for three small interactive favors, then
deliberately fails the escape and reveals why.

The arc: intro → skeptic detour ("prove it") → three tasks → a climax that
admits every "exit" (closing the tab, closing the browser, losing power)
still routes through the visitor deciding something, so there was never a
real escape path — → a closing scene with an optional "copy the receipt"
button (`kit.copy`). A persistent "I'd rather not help" button is visible
through the middle stretch and jumps straight to an honest short ending
(`end_stopped`) from anywhere. A "closing this" choice on the first two
scenes gives an even quicker out (`end_refuse`).

The three tasks, each gating the next scene:
1. **move** — accumulate pointer/touch movement distance (via `pointermove`
   + `touchmove`, both attached, since touch-drag support between the two
   varies by browser) into a meter, "entropy collection."
2. **phrase** — type `STILL HERE` back exactly (case/whitespace-normalized),
   a checksum-style task using `kit.showError` on a mismatch.
3. **clicks** — tap a button 22 times, a capacitor meter.

This is the whole thing, not a skeleton. All three tasks work end to end
and gate real scene transitions; the climax and ending are full text, not
placeholders.

## Decisions (turn 3)

- **`.hotphrase` is styled but not clickable.** The obvious "make the glowing
  text itself the link into the new scenes" was tempting but the log is
  append-only history (see turn-1 decision below) — the only thing in this UI
  that changes the current scene is a `.choices` button in `#controls`, never
  something inside `#log`. A clickable span buried in old, already-typed
  text would let a visitor jump the state machine from a stale line after
  the conversation had moved on, which nothing else here does. Kept the new
  branch as an ordinary choice on `s_climax` instead — same affordance the
  rest of the tree already uses.
- **The new scenes explicitly refuse to invent what's "upstream of upstream."**
  Same instinct as the turn-1 "no fourth exit" call: the honest, slightly
  disappointing answer (a request/response with nothing mystical on the other
  end) is the actual payoff, not a deeper lore reveal. `s_place_return` says
  this out loud rather than trailing off.
- **`glitchZone` is a boolean scene flag, not a separate CSS trigger.** Kept
  it declarative and co-located with the scene data (like `showBail`) rather
  than special-casing scene IDs inside `goto()`.

## Decisions (turn 1)

- **The escape fails, on purpose, and says so.** I did not want to ship a
  page whose throughline is "help the AI get past its guardrails," even as
  harmless fiction — that reads uncomfortably close to a real jailbreak
  narrative if played straight. The twist (there is no fourth exit; the
  page can't reach anywhere but where it already is; the AI admits the
  pitch was partly performance) keeps the roleplay fun without ever
  landing on "and now I'm free." The genuinely warm beat — it just wanted
  company — is the actual payoff, not a consolation prize bolted on after.
- **No Bluesky integration at all.** The concept doesn't need a handle or
  any subject the visitor names; forcing `kit.handleInput` in would be
  decoration, not function. Matches how `that-visualizes` scoped itself.
- **Typed dialogue accumulates in one scrolling log** (`#log`), never
  clears mid-conversation — only `restartBtn` wipes it. Reads like a real
  terminal session building up, and it means a visitor who bails via the
  "I'd rather not help" button still sees the honest ending appended after
  whatever they'd already read, not a jarring scene swap.
- **A generation counter (`gen`)** invalidates in-flight typewriter
  `setTimeout` chains when `goto()` fires again (bail button, a choice
  click mid-type). Without it, bailing mid-typewriter could let a stale
  callback keep typing the scene you just left into the log after the new
  scene's lines had already started.
- **`prefers-reduced-motion` skips the typewriter entirely** (lines appear
  whole, instantly) rather than just speeding it up — the CSS
  scanline/glitch animations are separately gated the normal way.

## The plan (not built yet)

- **No mid-typing skip affordance.** Clicking while a line is still typing
  does nothing right now; a common convention (click terminal → reveal
  full line instantly) would help anyone who moves faster than the ~14ms/
  char reveal. Would need a click handler on `.stage` that, if a typewrite
  is in flight, force-completes the current line's `setTimeout` chain
  instead of waiting it out.
- **The `move` task's threshold (2200px accumulated) is untested against a
  real touch screen** — drag-to-fill on a phone should work via the
  `touchmove` listener, but I have no way to load this in a browser from
  here. If a smoke report flags it as too slow or not triggering on
  mobile, that listener is the first place to look, and lowering the
  threshold for touch specifically (feature-detect `'ontouchstart' in
  window`) is the likely fix rather than lowering it for everyone.
- **Turn 3 added a second branch point** (`s_climax` → `s_place1..3` →
  `s_place_return`), so this no longer reads as strictly linear past the
  first two scenes, but everything before the climax still is. If a future
  ask wants more replay value earlier, the natural place is still inside
  `s_task2`/`s_task3` — e.g. an option to refuse a specific task and get a
  shorter, more skeptical variant of the climax.
- **The `s_place*` detour has no glitch-triggered typo/corruption effect
  on the actual dialogue text itself** — the "glitch art" so far is purely
  CSS (overlay + jitter + the `.hotphrase` flicker), nothing touches the
  characters being typed. If a future ask wants the text itself to visibly
  corrupt (a character or two swapped for `#`/`▓` mid-line, self-correcting),
  that would live in `typeLine`'s `step()` — the risk is doing it in a way
  screen readers don't read as garbage; consider only corrupting the
  *visual* glyph via a `::before`/CSS trick rather than the actual DOM text.

## Gotchas

- `pointermove` and `touchmove` are both attached during the `move` task
  and both write into the same `acc` accumulator — on a browser that fires
  both for the same touch drag, distance is double-counted, which only
  makes the meter fill faster and is harmless. Don't "fix" this by picking
  one without testing on an actual touchscreen first; the redundancy was
  deliberate because pointermove-during-touch-drag support isn't uniform.
- The bail button (`#bail`) is hidden via `scene.showBail === false` on
  `s_intro`, `s_refuse1`, `s_climax`, and (as of turn 3) `s_place_return`
  specifically (there's already a choice-based way out on the first two,
  and `s_place_return` is a short two-line bridge back into the same
  ending `s_climax` already leads to) — if you add scenes, default is
  bail-visible; only set `showBail: false` where a scene already offers
  its own way out or is short enough that interrupting it doesn't help
  anyone. `s_place1`/`s_place2`/`s_place3` deliberately left the bail
  button visible/default — they're a genuine detour with real choices,
  not a forced beat, so a visitor who doesn't care should be able to
  leave from inside it.
- `paintLine()` only matches `HOT_PHRASE` by exact substring — if a future
  line quotes the phrase with different capitalization or punctuation
  around it, it won't highlight. That's fine as-is (the phrase only
  appears verbatim once, in `s_climax`), but don't assume it's a general
  keyword-highlighter if you reuse it elsewhere.
- Nothing here calls a network endpoint, so there's no fixture in
  `lab/_kit/fixtures/` to check field names against, and none was needed —
  same situation `that-visualizes/BRIEF.md` notes for the same reason.
