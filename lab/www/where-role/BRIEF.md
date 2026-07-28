# BRIEF — where-role

## What this is

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

## Decisions

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
- **Only one branch point** (the "prove it" detour) actually diverges
  before reconverging at `s_task1`; everything else is linear once past
  the first two scenes. If a future ask wants more replay value, the
  natural place to add a second real branch is inside `s_task2` or
  `s_task3` — e.g. an option to refuse a specific task and get a shorter,
  more skeptical variant of the climax rather than routing every path
  through the same three tasks.

## Gotchas

- `pointermove` and `touchmove` are both attached during the `move` task
  and both write into the same `acc` accumulator — on a browser that fires
  both for the same touch drag, distance is double-counted, which only
  makes the meter fill faster and is harmless. Don't "fix" this by picking
  one without testing on an actual touchscreen first; the redundancy was
  deliberate because pointermove-during-touch-drag support isn't uniform.
- The bail button (`#bail`) is hidden via `scene.showBail === false` on
  `s_intro`, `s_refuse1`, and `s_climax` specifically (there's already a
  choice-based way out on the first two, and interrupting the climax's
  reveal felt worse than letting it play out) — if you add scenes, default
  is bail-visible; only set `showBail: false` where a scene already offers
  its own way out or is short enough that interrupting it doesn't help
  anyone.
- Nothing here calls a network endpoint, so there's no fixture in
  `lab/_kit/fixtures/` to check field names against, and none was needed —
  same situation `that-visualizes/BRIEF.md` notes for the same reason.
