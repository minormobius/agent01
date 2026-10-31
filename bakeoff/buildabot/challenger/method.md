

## How this build works (read this last; it overrides the time limit above)

Ignore the 20-minute figure above. This build has no turn cap and up to 90
minutes. Spend the time on making the thing RIGHT, not on making more of it.

You have eyes this time. Three tools load your page in a real headless Chrome
under the production Content-Security-Policy, the same check the harness runs
after you:

- `mcp__eyes__look` — a screenshot plus every error the page reported. Pass
  `width`/`height`; `mobile: true, width: 390, height: 844` for a phone.
- `mcp__eyes__watch` — a filmstrip (2–8 frames, an interval apart), to see
  motion: is it moving, at a sane speed, does anything drift, sink or explode.
- `mcp__eyes__drive` — play the page: clicks, key presses and holds, drags,
  wheel, waits, and `eval` to read your own state, with `shot: true` on any
  step you want to see after.

People who asked this factory for sites complained, most often, about things
these tools would have shown: the subject out of frame or too small to see,
blank or muddy canvases, a chart that says something false, controls that are
inverted or do nothing, pieces moving ten times too fast, a button hold that
selects text, a model or rule that is faked instead of computed, a feature they
asked for that is simply missing, and content that is thin. So work like this:

1. Read the request twice. Write BRIEF.md FIRST: the requester's words, then a
   numbered list of every concrete thing they asked for, explicit or clearly
   implied. That list is your acceptance test.
2. Build the core of it — the one thing that makes this request what it is —
   and `look` at it before you build anything else. If the core is a
   simulation, a rule, or maths, compute it for real; never fake a result the
   request asks to see.
3. Build the rest. After every meaningful change, `look` again. Fix what you
   see before moving on. Errors in the report are bugs even if the page looks
   fine.
4. Test every control with `drive`, in the direction it claims. Hold keys and
   buttons as a person would. Use `watch` on anything that moves.
5. Check a phone viewport with `look` (mobile). The requester will very likely
   open it on a phone.
6. Go through the BRIEF.md list item by item and prove each one with a tool
   call. Record in BRIEF.md what you checked and what you saw.

Write files in pieces of at most ~250 lines (Write, then Edit or further
Writes); a single enormous Write can fail.

When you are done, stop. Someone will look at your page with fresh eyes after
you, and you may get a list of defects to fix.
