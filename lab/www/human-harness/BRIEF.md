# harness-that — handoff

## What this is

The requester's line was "enough agent harnesses, what we really need is a
harness for humans." Built as a satirical/functional productivity tool that
gives a human the exact scaffolding an LLM agent harness gives a model:

- an editable **system prompt** (their own words, persisted)
- a **task queue** — add/complete/reorder/delete, priority tags
- **tool calls** — a fixed set of mundane human actions (coffee, bathroom,
  slack, lunch, touch grass, standup) that require explicit
  approve/deny before they're "logged", mocking tool-use permission prompts
- **real-time steering** — inject a message mid-task, it interrupts as a
  banner overlay, same shape as a supervisor steering a running agent
- **token efficiency** — every character typed anywhere on the page is
  charged at ~4 chars/token (labelled as an estimate, not a real tokenizer),
  tallied into tokens-spent, tokens/task, a sparkline of tokens-per-completed-
  task, and a context-window bar (4096 token cap, a "compact" button that
  resets the session counter without touching history or the task list)

Everything is `localStorage` only, keyed `lab-harness-that:v1`. No Bluesky
lookup, no OAuth, no backend call of any kind — this shipped as a pure-concept
page, which fits this requester's established comfort with that (see
`lab/_profiles/ezba.bsky.social.md`).

## Decisions

- **No sign-in.** The page is meaningless-if-demanded territory the other
  way round: it's a personal tool, one browser, one person. Bolting on
  ATProto storage would mean asking a visitor to OAuth into Bluesky just to
  keep a personal to-do list, which is exactly the "demands OAuth before
  showing anything" trap the brief warns against. If a future ask wants
  cross-device sync or a leaderboard of who has the worst tokens/task, that's
  the natural next use for `pds.js` — see THE PLAN.
- **Token count is an honest approximation**, stated as such in the "show the
  math" reveal (chars/4, same heuristic real tokenizers roughly follow) —
  not a real tokenizer, no claim that it is one.
- **Compaction resets the session counter only**, not the all-time total or
  the task list. A destructive "compact = wipe your history" button felt like
  the wrong joke to land on a tool people might actually use for real tasks.
- Followed the established style profile: rainbow gradient chrome (h1 text,
  card borders, primary buttons) with plain-contrast reading surfaces, and
  gave the "show the math" toggle the same filled+pulsing treatment as a
  primary button per prior feedback that plain outlined toggles get missed.
- Sparkline is a single series (tokens per completed task) — per the dataviz
  skill, a single series needs no legend, so none was added; hover via native
  SVG `<title>` on each point instead of a full custom tooltip, given the
  20-minute budget.

## The plan (not built yet, in likely order)

1. **Persistence across devices** — swap/extend the localStorage state for
   `store.save('board', state)` via `/_kit/pds.js`, sign-in optional, "save to
   your repo" as an explicit action rather than automatic. Would also enable
   a real `postScore`/leaderboard of tokens-per-task among handles the
   visitor names, which fits the "leaderboard is people the visitor named"
   rule cleanly.
2. **Export/import** — a JSON export of the whole state so someone can back
   up or transfer their queue without the repo integration above; cheap,
   no new capability needed, just a Blob + `<a download>`.
3. **More tool "side effects" and a rate limiter** — e.g. `take_lunch()`
   actually refusing a second call per session (the copy claims this; the
   code doesn't enforce it yet). Small, mechanical, good first task for the
   next turn.
4. **A weekly/daily reset** — right now `history` just caps at 30 entries and
   the session token bar only resets on manual "compact." A date-aware
   reset (new calendar day = new session) would make the context-window
   metaphor land harder without extra clicks.

## Gotchas

- Nothing broke the build, but note for next time: the tool grid buttons use
  `<code>` and `<span>` inside a `<button>` via `innerHTML` — fine here since
  none of the interpolated strings are visitor-controlled (all from the
  static `TOOLS` array), but if a future edit lets a visitor's own text into
  a tool label, switch that to `textContent` assignment instead of
  `innerHTML` to stay XSS-safe.
- Untested in an actual browser by me — per the harness's own note, a
  post-build pass loads this under production CSP and screenshots it. Watch
  for the gradient-border `.card` background trick (two stacked
  `linear-gradient`s with two `background-position` values in the
  `borderMove` keyframe) — that's the one CSS technique here fiddly enough to
  misrender if a browser handles multi-layer `background-position` shorthand
  differently than expected.
